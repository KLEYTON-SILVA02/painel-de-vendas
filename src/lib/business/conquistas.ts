// Ported from legacy/index-original.html's Galeria de Conquistas spec —
// tiers are now per-category (not one shared R$ ladder), and cover Levmel/
// Chip (unit-based) alongside the three R$ categories. The old "Super Meta
// Individual" concept (a per-collaborator override tier) was dropped:
// individual-goal configuration now lives exclusively in ADM > Metas >
// Metas Individuais, and an achievement here is always one of the fixed
// tiers below.
import { computeSummary, type SpecialListItem } from './summary';
import type { Collaborator, Sale, SummaryRow } from './types';

export type ConquistaCategoria = 'DERM' | 'GEN' | 'MP' | 'LEVMEL' | 'CHIP';

/** Fixed achievement thresholds per category — R$ for DERM/GEN/MP, unidades
 * vendidas for LEVMEL/CHIP. */
export const CONQUISTA_TIERS_BY_CAT: Record<ConquistaCategoria, readonly number[]> = {
  DERM: [3000, 5000, 10000],
  GEN: [1000, 2000, 3000],
  MP: [1000, 2000, 3000],
  LEVMEL: [5, 10, 15],
  CHIP: [10, 20, 50],
};

export function isUnitConquista(categoria: ConquistaCategoria): boolean {
  return categoria === 'LEVMEL' || categoria === 'CHIP';
}

const CONQUISTA_TIER_SUFFIX: Record<ConquistaCategoria, string> = {
  DERM: 'DERMOCOSMÉTICOS',
  GEN: 'GENÉRICOS',
  MP: 'MARCA PRÓPRIA',
  LEVMEL: 'LEVMEL',
  CHIP: 'CHIP',
};

/** "3K DERMOCOSMÉTICOS" / "1K MARCA PRÓPRIA" / "5un LEVMEL" / "10un CHIP" */
export function conquistaTierLabel(categoria: ConquistaCategoria, tier: number): string {
  return isUnitConquista(categoria) ? `${tier}un ${CONQUISTA_TIER_SUFFIX[categoria]}` : `${tier / 1000}K ${CONQUISTA_TIER_SUFFIX[categoria]}`;
}

export interface ConquistaRow extends SummaryRow {
  /** The highest fixed tier reached this period (R$ or un., per category), or 0 if none. */
  tier: number;
}

/** The metric an achievement is measured by for this category: sale value
 * for the three R$ categories, item count for Levmel/Chip. */
function conquistaMetric(categoria: ConquistaCategoria, row: SummaryRow): number {
  return isUnitConquista(categoria) ? row.itens : row.valor;
}

function tierForMetric(tiers: readonly number[], metric: number): number {
  let tier = 0;
  tiers.forEach((t) => {
    if (metric >= t) tier = t;
  });
  return tier;
}

/**
 * Top 10 achievers for a category/period: anyone who reached one of that
 * category's fixed tiers **within a single day** — a tier is never reached
 * by summing several days together (e.g. the whole month in "Modo Geral").
 * Each day in [fromDate, toDate] is scored on its own, and a collaborator's
 * entry is their single best day within the range (tier first, then the
 * day's own metric as a tie-breaker between equal tiers), sorted by that
 * best-day metric desc. A collaborator with no sales, or whose best single
 * day never reaches the first tier, never appears. `specialLists` is only
 * needed for LEVMEL/CHIP (matched by product name, not by `sale.grupo`) —
 * see computeSummary.
 */
export function computeConquistas(
  sales: Sale[],
  collaborators: Collaborator[],
  fromDate: string | null,
  toDate: string | null,
  catKey: ConquistaCategoria,
  specialLists?: { levmel: SpecialListItem[]; chip: SpecialListItem[] },
): ConquistaRow[] {
  const collaboratorsByMatricula = new Map(collaborators.map((c) => [c.matricula, c]));
  const tiers = CONQUISTA_TIERS_BY_CAT[catKey];

  // No bounded range to iterate day-by-day — score the whole (unbounded)
  // selection at once. No real caller hits this (dashFrom/dashTo are
  // always concrete dates); kept only so the `string | null` signature
  // stays honored.
  if (!fromDate || !toDate) {
    const rows = computeSummary(sales, collaborators, fromDate, toDate, catKey, specialLists);
    return rows
      .map((r) => {
        const tier = tierForMetric(tiers, conquistaMetric(catKey, r));
        const foto = collaboratorsByMatricula.get(r.matricula)?.fotoConquista || r.foto;
        return { ...r, foto, tier };
      })
      .filter((r) => r.tier > 0)
      .sort((a, b) => conquistaMetric(catKey, b) - conquistaMetric(catKey, a))
      .slice(0, 10);
  }

  const bestByMatricula = new Map<string, ConquistaRow>();
  for (let d = new Date(`${fromDate}T00:00:00`); d.toISOString().slice(0, 10) <= toDate; d.setDate(d.getDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    computeSummary(sales, collaborators, day, day, catKey, specialLists).forEach((r) => {
      const metric = conquistaMetric(catKey, r);
      const tier = tierForMetric(tiers, metric);
      if (tier === 0) return;
      const current = bestByMatricula.get(r.matricula);
      const currentMetric = current ? conquistaMetric(catKey, current) : -1;
      if (!current || tier > current.tier || (tier === current.tier && metric > currentMetric)) {
        // Cards in the Galeria de Conquistas use the collaborator's
        // dedicated conquista photo (cropped for this card format) when
        // set, instead of their regular avatar used everywhere else
        // (podiums, extracts, etc).
        const foto = collaboratorsByMatricula.get(r.matricula)?.fotoConquista || r.foto;
        bestByMatricula.set(r.matricula, { ...r, foto, tier });
      }
    });
  }

  return Array.from(bestByMatricula.values())
    .sort((a, b) => conquistaMetric(catKey, b) - conquistaMetric(catKey, a))
    .slice(0, 10);
}

/** One entry per day in [fromDate, toDate], newest first, with how many
 * achievers that single day had — powers the sidebar "Galeria de dias". */
export function computeConquistasDayGallery(
  sales: Sale[],
  collaborators: Collaborator[],
  fromDate: string,
  toDate: string,
  catKey: ConquistaCategoria,
  specialLists?: { levmel: SpecialListItem[]; chip: SpecialListItem[] },
): { dia: string; count: number }[] {
  const days: string[] = [];
  for (let d = new Date(`${fromDate}T00:00:00`); d.toISOString().slice(0, 10) <= toDate; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days
    .reverse()
    .map((dia) => ({ dia, count: computeConquistas(sales, collaborators, dia, dia, catKey, specialLists).length }));
}
