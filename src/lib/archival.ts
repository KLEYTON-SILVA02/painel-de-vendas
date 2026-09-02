// REGRA 2: sales are only kept in full detail for 3 months. `sales.grupo`
// already stores DERM/GEN/MP/MER at import time, but LEVMEL/CHIP and the
// BIOSINTÉTICA G1-G4 groups are matched against product names at read time
// (special_lists / bio_groups keyword lists) — not stored — so this has to
// reuse the exact same classification helpers the rest of the app uses
// before the raw `sales` rows for an old month are deleted. Goals
// (`goals`/`individual_goals`) already persist independently of `sales`, so
// they don't need archiving here.
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { groupBioRows } from './business/bio';
import { classifyBio, CAT_KEYS, type BioGroupKey } from './business/classification';
import { matchesSpecialList, type SpecialListItem } from './business/summary';
import type { BioGroupsProducts, Sale } from './business/types';
import { useBioGroups, useCategoryTypes, useSales, useSpecialLists } from './queries';
import { supabase } from './supabase';

const RETENTION_MONTHS = 3;

/** First day of the month, N months before today, as an ISO date string. */
function monthsAgoFirstDay(n: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

/** Sales dated before this cutoff are past their 3-month retention window. */
export function archiveCutoffISO(): string {
  return monthsAgoFirstDay(RETENTION_MONTHS);
}

function monthKey(dataISO: string): string {
  return `${dataISO.slice(0, 7)}-01`;
}

export interface ArchivedCategoryRow {
  year_month: string;
  categoria: string;
  valor_total: number;
  itens_total: number;
  vendas_total: number;
}

export interface ArchivedCollaboratorRow {
  year_month: string;
  matricula: string;
  nome: string;
  valor_total: number;
  itens_total: number;
}

const CAT_KEY_SET = new Set<string>(CAT_KEYS);
const BIO_GROUP_KEY_SET = new Set<string>(['G1', 'G2', 'G3', 'G4'] satisfies BioGroupKey[]);
export const ARCHIVE_CATEGORY_ORDER = [...CAT_KEYS, 'LEVMEL', 'CHIP', 'G1', 'G2', 'G3', 'G4'];

/** A sale can land in more than one bucket at once — its DERM/GEN/MP/MER
 * category from `grupo`, and independently a LEVMEL/CHIP special-list match
 * and/or a BIOSINTÉTICA group match, exactly like every other screen in the
 * app treats these as overlapping tags rather than a single exclusive tree. */
export function computeArchiveAggregates(
  sales: Sale[],
  specialLists: { levmel: SpecialListItem[]; chip: SpecialListItem[] },
  bioGroups: BioGroupsProducts,
): { categorias: ArchivedCategoryRow[]; colaboradores: ArchivedCollaboratorRow[] } {
  const categorias = new Map<string, { valor: number; itens: number; vendas: number }>();
  const colaboradores = new Map<string, { nome: string; valor: number; itens: number }>();

  const bumpCategoria = (month: string, categoria: string, valor: number, itens: number) => {
    const key = `${month}|${categoria}`;
    const cur = categorias.get(key) ?? { valor: 0, itens: 0, vendas: 0 };
    cur.valor += valor;
    cur.itens += itens;
    cur.vendas += 1;
    categorias.set(key, cur);
  };

  sales.forEach((s) => {
    if (!s.dataISO) return;
    const month = monthKey(s.dataISO);
    const valor = Number(s.valor) || 0;
    const itens = Number(s.qtd) || 0;

    if (s.grupo && CAT_KEY_SET.has(s.grupo)) bumpCategoria(month, s.grupo, valor, itens);
    if (matchesSpecialList(s.produto, specialLists.levmel)) bumpCategoria(month, 'LEVMEL', valor, itens);
    if (matchesSpecialList(s.produto, specialLists.chip)) bumpCategoria(month, 'CHIP', valor, itens);
    const bioGroup = classifyBio(s.produto, bioGroups);
    if (bioGroup && BIO_GROUP_KEY_SET.has(bioGroup)) bumpCategoria(month, bioGroup, valor, itens);

    const collabKey = `${month}|${s.matricula}`;
    const collabCur = colaboradores.get(collabKey) ?? { nome: s.vendedor || s.matricula, valor: 0, itens: 0 };
    collabCur.valor += valor;
    collabCur.itens += itens;
    colaboradores.set(collabKey, collabCur);
  });

  return {
    categorias: Array.from(categorias.entries()).map(([key, v]) => {
      const [year_month, categoria] = key.split('|');
      return { year_month, categoria, valor_total: v.valor, itens_total: v.itens, vendas_total: v.vendas };
    }),
    colaboradores: Array.from(colaboradores.entries()).map(([key, v]) => {
      const [year_month, matricula] = key.split('|');
      return { year_month, matricula, nome: v.nome, valor_total: v.valor, itens_total: v.itens };
    }),
  };
}

export interface ArchiveRunResult {
  archivedMonths: string[];
  deletedCount: number;
}

/** Archives every sale older than the 3-month retention window for a store,
 * then deletes those raw rows. Aggregates are written first — the delete
 * only runs once the archive upsert has succeeded, so a failure here never
 * loses data, just leaves it for the next run to pick up again. */
export async function archiveOldSalesForStore(
  storeId: string,
  sales: Sale[],
  specialLists: { levmel: SpecialListItem[]; chip: SpecialListItem[] },
  bioGroups: BioGroupsProducts,
): Promise<ArchiveRunResult | null> {
  const cutoff = archiveCutoffISO();
  const oldSales = sales.filter((s) => s.dataISO && s.dataISO < cutoff);
  if (!oldSales.length) return null;

  const { categorias, colaboradores } = computeArchiveAggregates(oldSales, specialLists, bioGroups);

  if (categorias.length) {
    const { error } = await supabase
      .from('sales_archive_categories')
      .upsert(
        categorias.map((c) => ({ store_id: storeId, ...c })),
        { onConflict: 'store_id,year_month,categoria' },
      );
    if (error) throw error;
  }
  if (colaboradores.length) {
    const { error } = await supabase
      .from('sales_archive_collaborators')
      .upsert(
        colaboradores.map((c) => ({ store_id: storeId, ...c })),
        { onConflict: 'store_id,year_month,matricula' },
      );
    if (error) throw error;
  }

  const ids = oldSales.map((s) => s.id);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { error } = await supabase.from('sales').delete().in('id', chunk);
    if (error) throw error;
  }

  const archivedMonths = Array.from(new Set(oldSales.map((s) => monthKey(s.dataISO!)))).sort();
  return { archivedMonths, deletedCount: ids.length };
}

/** Runs the REGRA 2 archival automatically — no admin action needed — once
 * per store per day, the first time an admin session has all the data it
 * needs loaded. Safe to call unconditionally on every render: it no-ops
 * until `profile` is an admin and every query it depends on has resolved,
 * and a `ranRef` guard means it only ever fires once per mount even though
 * its dependencies (sales, in particular) change again right after a run
 * deletes rows. */
export function useAutoArchiveOldSales(): void {
  const { profile } = useAuth();
  const { data: sales, refetch: refetchSales } = useSales();
  const { data: specialLists } = useSpecialLists();
  const { data: categoryTypes } = useCategoryTypes();
  const bioCategoryType = categoryTypes?.find((c) => c.chave === 'biosintetica');
  const { data: bioGroupRows } = useBioGroups(bioCategoryType?.id);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (!profile || profile.role !== 'admin' || !profile.store_id) return;
    if (!sales || !specialLists || !bioCategoryType || !bioGroupRows) return;

    const storageKey = `archive_last_run_${profile.store_id}`;
    const today = new Date().toISOString().slice(0, 10);
    let last: string | null = null;
    try {
      last = localStorage.getItem(storageKey);
    } catch {
      // localStorage unavailable (private mode, disabled storage) — just
      // run the check every mount instead of once a day.
    }
    if (last === today) {
      ranRef.current = true;
      return;
    }

    ranRef.current = true;
    const bioGroups = groupBioRows(bioGroupRows);
    archiveOldSalesForStore(profile.store_id, sales, specialLists, bioGroups)
      .then((result) => {
        try {
          localStorage.setItem(storageKey, today);
        } catch {
          // best-effort only
        }
        if (result) refetchSales();
      })
      .catch((err) => {
        console.error('Falha ao arquivar vendas antigas automaticamente:', err);
      });
  }, [profile, sales, specialLists, bioCategoryType, bioGroupRows, refetchSales]);
}
