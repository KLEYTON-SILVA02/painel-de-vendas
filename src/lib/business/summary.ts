// Ported 1:1 from legacy/index-original.html (computeSummary / catTotals).
import { CAT_KEYS, type CategoryKey } from './classification';
import { firstName, normalize } from './normalize';
import { normalizeMatricula } from './parsing';
import { VISITANTE_SETOR, type Collaborator, type Sale, type SummaryRow } from './types';

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
  catFilter?: CategoryKey | 'ALL' | 'LEVMEL' | 'CHIP' | string | null,
  specialLists?: { levmel: SpecialListItem[]; chip: SpecialListItem[] },
  /** ADM-created generic categories (Gerenciar Categorias), keyed by their
   * `category_types.chave` — matched the same way LEVMEL/CHIP are (product
   * name vs. keyword list), since a generic category has no `sale.grupo`
   * value of its own. Optional and additive: omitting it leaves every
   * existing caller (the 6 fixed categories) completely unaffected. */
  genericKeywordLists?: Record<string, SpecialListItem[]>,
): SummaryRow[] {
  // "Visitante" is a view-only sector (see VISITANTE_SETOR) — never part of
  // any metric, so it's excluded here at the shared aggregation root rather
  // than in each individual screen: it neither seeds a zero-sale row nor
  // picks up sales that happen to carry its matricula.
  const visitanteMatriculas = new Set(
    collaborators.filter((c) => c.setor === VISITANTE_SETOR).map((c) => normalizeMatricula(c.matricula)),
  );
  const metricCollaborators = collaborators.filter((c) => c.setor !== VISITANTE_SETOR);

  // Keyed by normalized matricula (leading zeros stripped) rather than the
  // raw stored value — collaborators and sales are both normalized before
  // insert (see mutations.ts / ImportarPage.tsx), but normalizing again
  // here too means a sale ↔ collaborator link never silently breaks over a
  // formatting difference in older rows written before that was in place.
  const map: Record<string, SummaryRow> = {};
  const registeredMatriculas = new Set(metricCollaborators.map((c) => normalizeMatricula(c.matricula)));
  metricCollaborators.forEach((c) => {
    const key = normalizeMatricula(c.matricula);
    map[key] = {
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
    } else if (genericKeywordLists && catFilter && genericKeywordLists[catFilter]) {
      if (!matchesSpecialList(s.produto, genericKeywordLists[catFilter])) return;
    } else if (catFilter && catFilter !== 'ALL' && s.grupo !== catFilter) {
      return;
    }

    const key = normalizeMatricula(s.matricula);
    if (visitanteMatriculas.has(key)) return;
    if (!map[key]) {
      // Placeholder — the sale's own vendedor text is often just an import
      // artifact ("VENDEDOR", blank, a store-code stand-in), not someone's
      // real name, so it's replaced with a stable "Vend. N" label below
      // rather than shown as-is.
      map[key] = {
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
    const row = map[key];
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
  const target = normalizeMatricula(matricula);
  let last: string | null = null;
  sales.forEach((s) => {
    if (normalizeMatricula(s.matricula) === target && s.dataISO) {
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
  const target = normalizeMatricula(matricula);
  const list = sales.filter((s) => {
    if (normalizeMatricula(s.matricula) !== target) return false;
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
