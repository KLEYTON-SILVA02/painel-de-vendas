// Ported 1:1 from legacy/index-original.html (computeSummary / catTotals).
import { CAT_KEYS, type CategoryKey } from './classification';
import { firstName, normalize } from './normalize';
import type { Collaborator, Sale, SummaryRow } from './types';

export interface SpecialListItem {
  nome: string;
  palavras: string[];
}

/** Matches a product name against a special list (Levmel, Chip) by keyword substring. */
export function matchesSpecialList(produtoNome: string, list: SpecialListItem[] | undefined): boolean {
  const n = normalize(produtoNome);
  if (!n || !list || !list.length) return false;
  return list.some((p) => {
    const palavras = p.palavras && p.palavras.length ? p.palavras : [p.nome];
    return palavras.some((kw) => {
      const pad = normalize(kw);
      return !!pad && n.includes(pad);
    });
  });
}

function emptyQtd(): Record<CategoryKey | 'SEM', number> {
  const qtd = {} as Record<CategoryKey | 'SEM', number>;
  CAT_KEYS.forEach((k) => (qtd[k] = 0));
  qtd.SEM = 0;
  return qtd;
}

/**
 * Per-collaborator sales summary within a date range, optionally filtered by
 * category, or by a special list (LEVMEL/CHIP) matched against product names.
 * Rows are seeded from every registered collaborator (so zero-sale collaborators
 * still appear) and unrecognized matriculas get synthesized rows from the sale itself.
 */
export function computeSummary(
  sales: Sale[],
  collaborators: Collaborator[],
  fromDate: string | null,
  toDate: string | null,
  catFilter?: CategoryKey | 'ALL' | 'LEVMEL' | 'CHIP' | null,
  specialLists?: { levmel: SpecialListItem[]; chip: SpecialListItem[] },
): SummaryRow[] {
  const map: Record<string, SummaryRow> = {};
  const registeredMatriculas = new Set(collaborators.map((c) => c.matricula));
  collaborators.forEach((c) => {
    map[c.matricula] = {
      matricula: c.matricula,
      nome: c.nome,
      apelido: c.apelido || firstName(c.nome),
      foto: c.foto,
      metaIndividual: Number(c.metaIndividual) || 0,
      qtd: emptyQtd(),
      valor: 0,
      itens: 0,
    };
  });

  sales.forEach((s) => {
    if (fromDate && s.dataISO && s.dataISO < fromDate) return;
    if (toDate && s.dataISO && s.dataISO > toDate) return;
    if (catFilter === 'LEVMEL' || catFilter === 'CHIP') {
      const list = catFilter === 'LEVMEL' ? specialLists?.levmel : specialLists?.chip;
      if (!matchesSpecialList(s.produto, list)) return;
    } else if (catFilter && catFilter !== 'ALL' && s.grupo !== catFilter) {
      return;
    }

    if (!map[s.matricula]) {
      // Placeholder — the sale's own vendedor text is often just an import
      // artifact ("VENDEDOR", blank, a store-code stand-in), not someone's
      // real name, so it's replaced with a stable "Vend. N" label below
      // rather than shown as-is.
      map[s.matricula] = {
        matricula: s.matricula,
        nome: s.matricula,
        apelido: s.matricula,
        foto: null,
        metaIndividual: 0,
        qtd: emptyQtd(),
        valor: 0,
        itens: 0,
      };
    }
    const row = map[s.matricula];
    const g = s.grupo;
    const qtdv = Number(s.qtd) || 0;
    const valor = Number(s.valor) || 0;
    if (g && row.qtd[g] !== undefined) row.qtd[g] += qtdv;
    else row.qtd.SEM += qtdv;
    row.valor += valor;
    row.itens += qtdv;
  });

  // Sellers with sales but no matching collaborator record show as "Vend.
  // N" (numbered by matricula, so the same unregistered seller always gets
  // the same label within one result set) instead of whatever free-text
  // name came through the sales import.
  Object.keys(map)
    .filter((matricula) => !registeredMatriculas.has(matricula))
    .sort()
    .forEach((matricula, i) => {
      const label = `Vend. ${i + 1}`;
      map[matricula].nome = label;
      map[matricula].apelido = label;
    });

  return Object.values(map).sort((a, b) => b.valor - a.valor);
}

/** Total quantity/value sold for a single category within a date range. */
export function catTotals(sales: Sale[], fromDate: string | null, toDate: string | null, key: CategoryKey) {
  let qtd = 0;
  let valor = 0;
  sales.forEach((s) => {
    if (fromDate && s.dataISO && s.dataISO < fromDate) return;
    if (toDate && s.dataISO && s.dataISO > toDate) return;
    if (s.grupo !== key) return;
    qtd += Number(s.qtd) || 0;
    valor += Number(s.valor) || 0;
  });
  return { qtd, valor };
}

/** Last sale date for a matricula — used to flag 60+ days of inactivity. */
export function lastSaleDateFor(sales: Sale[], matricula: string): string | null {
  let last: string | null = null;
  sales.forEach((s) => {
    if (s.matricula === matricula && s.dataISO) {
      if (!last || s.dataISO > last) last = s.dataISO;
    }
  });
  return last;
}

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d1 = new Date(iso + 'T00:00:00');
  const d2 = new Date();
  return Math.floor((d2.getTime() - d1.getTime()) / 86400000);
}

/** A single collaborator's sales extract, filtered by category (or special
 * list for LEVMEL/CHIP) and date range, newest first. */
export function computeVendorExtract(
  sales: Sale[],
  matricula: string,
  catKey: CategoryKey | 'LEVMEL' | 'CHIP' | 'ALL',
  fromDate: string | null,
  toDate: string | null,
  specialLists?: { levmel: SpecialListItem[]; chip: SpecialListItem[] },
): Sale[] {
  const isUnit = catKey === 'LEVMEL' || catKey === 'CHIP';
  const list = sales.filter((s) => {
    if (s.matricula !== matricula) return false;
    if (fromDate && s.dataISO && s.dataISO < fromDate) return false;
    if (toDate && s.dataISO && s.dataISO > toDate) return false;
    if (isUnit) {
      const lst = catKey === 'LEVMEL' ? specialLists?.levmel : specialLists?.chip;
      return matchesSpecialList(s.produto, lst);
    }
    if (catKey && catKey !== 'ALL') return s.grupo === catKey;
    return true;
  });
  return list.slice().sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''));
}
