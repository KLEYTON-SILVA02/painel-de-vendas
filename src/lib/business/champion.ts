// Star rating for the champion card: one star per Galeria de Conquistas
// category (Dermo/Genérico/Marcas Exclusivas/Levmel/Chip) where the
// champion themself reached at least the first fixed tier, within the same
// day/month window used to pick the champion — mirrors exactly what the
// Galeria de Conquistas screen would show as an achiever for that period.
import { computeConquistas, type ConquistaCategoria } from './conquistas';
import type { SpecialListItem } from './summary';
import type { Collaborator, Sale } from './types';

export interface ChampionStar {
  key: ConquistaCategoria;
  label: string;
  achieved: boolean;
}

// The 5 categories currently tracked for the star rating. Dynamic on
// purpose — adding or removing a tracked category later is a one-line
// change here, no changes needed in the champion card components
// (DashboardPage.tsx / MobileInicioPage.tsx just render whatever this
// returns).
export const CHAMPION_STAR_CATEGORIES: { key: ConquistaCategoria; label: string }[] = [
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
): ChampionStar[] {
  return CHAMPION_STAR_CATEGORIES.map(({ key, label }) => {
    const achievers = computeConquistas(sales, collaborators, from, to, key, specialLists);
    return { key, label, achieved: achievers.some((r) => r.matricula === matricula) };
  });
}
