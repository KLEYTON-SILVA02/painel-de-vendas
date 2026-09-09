// Star rating for the champion card: one star per Galeria de Conquistas
// category (Dermo/Genérico/Marcas Exclusivas/Levmel/Chip) where the
// champion themself reached at least the first fixed tier, within the same
// day/month window used to pick the champion — mirrors exactly what the
// Galeria de Conquistas screen would show as an achiever for that period.
import { computeConquistas, type ConquistaCategoria, type GenericConquistaConfig } from './conquistas';
import { normalizeMatricula } from './parsing';
import type { SpecialListItem } from './summary';
import type { Collaborator, Sale } from './types';

export interface ChampionStar {
  key: ConquistaCategoria;
  label: string;
  achieved: boolean;
}

export interface ChampionStarCategory {
  key: ConquistaCategoria;
  label: string;
  /** Present only for an ADM-created generic category (Gerenciar
   * Categorias) — omitted for the 5 fixed categories below. Biosintética
   * never appears here: it's an isolated category with its own
   * meta1/2/3 achievement system, not part of Conquistas/Champion stars. */
  generic?: GenericConquistaConfig;
}

// The 5 categories currently tracked for the star rating. Dynamic on
// purpose — adding or removing a tracked category later is a one-line
// change here, no changes needed in the champion card components
// (DashboardPage.tsx / MobileInicioPage.tsx just render whatever this
// returns).
export const CHAMPION_STAR_CATEGORIES: ChampionStarCategory[] = [
  { key: 'DERM', label: 'Dermocosméticos' },
  { key: 'GEN', label: 'Genérico' },
  { key: 'MP', label: 'Marcas Exclusivas' },
  { key: 'LEVMEL', label: 'Levmel' },
  { key: 'CHIP', label: 'Chip' },
];

export function computeChampionStars(
  matricula: string,
  sales: Sale[],
  collaborators: Collaborator[],
  specialLists: { levmel: SpecialListItem[]; chip: SpecialListItem[] } | undefined,
  from: string,
  to: string,
  /** ADM-created generic categories (with Conquistas tiers configured) to
   * score alongside the 5 fixed ones — additive and optional so every
   * existing caller keeps scoring just the fixed 5 until it's updated to
   * pass its own list. */
  extraCategories?: ChampionStarCategory[],
): ChampionStar[] {
  const target = normalizeMatricula(matricula);
  const categories = extraCategories?.length ? [...CHAMPION_STAR_CATEGORIES, ...extraCategories] : CHAMPION_STAR_CATEGORIES;
  return categories.map(({ key, label, generic }) => {
    const achievers = computeConquistas(sales, collaborators, from, to, key, specialLists, generic);
    return { key, label, achieved: achievers.some((r) => normalizeMatricula(r.matricula) === target) };
  });
}
