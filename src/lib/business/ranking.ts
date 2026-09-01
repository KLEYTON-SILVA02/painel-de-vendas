// Ported 1:1 from legacy/index-original.html (computeColumnRanking).
import type { CategoryKey } from './classification';
import { computeSummary, type SpecialListItem } from './summary';
import type { Collaborator, Sale, SummaryRow } from './types';

export interface ColumnRankingRow extends SummaryRow {
  pct: number | null;
}

/**
 * Per-category ranking column with individual goal attainment %. The
 * collaborator's meta_individual is a monthly figure; in "dia" mode it's
 * prorated by the number of days in the reference month before computing
 * the percentage (capped at 999 to avoid absurd bars for tiny goals).
 */
export function computeColumnRanking(
  sales: Sale[],
  collaborators: Collaborator[],
  fromDate: string | null,
  toDate: string | null,
  catFilter: CategoryKey | 'LEVMEL' | 'CHIP' | 'ALL',
  isUnit: boolean,
  mode: 'dia' | 'mes',
  refYear: number,
  refMonth: number,
  specialLists?: { levmel: SpecialListItem[]; chip: SpecialListItem[] },
): ColumnRankingRow[] {
  const list = computeSummary(sales, collaborators, fromDate, toDate, catFilter, specialLists).filter((r) =>
    isUnit ? r.itens > 0 : r.valor > 0,
  );
  const daysInMonth = new Date(refYear, refMonth + 1, 0).getDate();
  return list
    .map((r) => {
      let metaEfetiva = r.metaIndividual;
      if (mode === 'dia' && metaEfetiva > 0) metaEfetiva = metaEfetiva / daysInMonth;
      const valorRef = isUnit ? r.itens : r.valor;
      const pct = metaEfetiva > 0 ? Math.min(999, (valorRef / metaEfetiva) * 100) : null;
      return { ...r, pct };
    })
    .sort((a, b) => (isUnit ? b.itens - a.itens : b.valor - a.valor));
}

/** Staggered podium height by position (not proportional to value) — the
 * same formula the "escadinha" ranking capsule design uses. */
export function podiumHeightPx(position: number): number {
  return Math.max(140, 220 - position * 8);
}

export function medalClass(position: number): 'gold' | 'silver' | 'bronze' | null {
  if (position === 0) return 'gold';
  if (position === 1) return 'silver';
  if (position === 2) return 'bronze';
  return null;
}
