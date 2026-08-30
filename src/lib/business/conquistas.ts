// Ported 1:1 from legacy/index-original.html's Galeria de Conquistas spec
// (CONQUISTAS_TIERS / computeConquistas) — see the design doc, section 3.4.
import { computeSummary } from './summary';
import type { Collaborator, Sale, SummaryRow } from './types';

export const CONQUISTA_TIERS = [1000, 2000, 3000, 5000, 10000] as const;
export type ConquistaTier = (typeof CONQUISTA_TIERS)[number];
export type ConquistaCategoria = 'DERM' | 'GEN' | 'MP';

export interface ConquistaRow extends SummaryRow {
  /** The highest fixed tier (R$) reached this period, or 0 if none. */
  tier: ConquistaTier | 0;
  /** True when the collaborator's own Super Meta Individual (if any) was reached. */
  bateuSuper: boolean;
  /** That collaborator's Super Meta Individual for this category, or 0 if unset. */
  superMeta: number;
}

/** matricula -> Super Meta Individual value for one category. */
export type SuperMetasPorMatricula = Record<string, number>;

/**
 * Top 10 achievers for a category/period: anyone who reached a fixed R$ tier
 * OR their own Super Meta Individual, sorted by valor desc. A collaborator
 * with no sales never appears (computeSummary seeds zero-valor rows for
 * every collaborator, but tier=0 and bateuSuper=false filters them out).
 */
export function computeConquistas(
  sales: Sale[],
  collaborators: Collaborator[],
  fromDate: string | null,
  toDate: string | null,
  catKey: ConquistaCategoria,
  superMetas: SuperMetasPorMatricula,
): ConquistaRow[] {
  const collaboratorsByMatricula = new Map(collaborators.map((c) => [c.matricula, c]));
  const rows = computeSummary(sales, collaborators, fromDate, toDate, catKey);
  return rows
    .map((r) => {
      let tier: ConquistaTier | 0 = 0;
      CONQUISTA_TIERS.forEach((t) => {
        if (r.valor >= t) tier = t;
      });
      const superMeta = Number(superMetas[r.matricula]) || 0;
      const bateuSuper = superMeta > 0 && r.valor >= superMeta;
      // Cards in the Galeria de Conquistas use the collaborator's dedicated
      // conquista photo (cropped for this card format) when set, instead of
      // their regular avatar used everywhere else (podiums, extracts, etc).
      const foto = collaboratorsByMatricula.get(r.matricula)?.fotoConquista || r.foto;
      return { ...r, foto, tier, bateuSuper, superMeta };
    })
    .filter((r) => r.tier > 0 || r.bateuSuper)
    .sort((a, b) => b.valor - a.valor)
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
  superMetas: SuperMetasPorMatricula,
): { dia: string; count: number }[] {
  const days: string[] = [];
  for (let d = new Date(`${fromDate}T00:00:00`); d.toISOString().slice(0, 10) <= toDate; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days
    .reverse()
    .map((dia) => ({ dia, count: computeConquistas(sales, collaborators, dia, dia, catKey, superMetas).length }));
}
