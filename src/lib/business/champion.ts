// Star rating for the champion card: one star per tracked category where
// the champion's own sales in the period reached that category's goal
// (Meta Diária on a single-day period, Meta Mensal otherwise — same
// mode-aware getGoal() every other gauge in the app already uses).
import type { GoalCategoryKey } from './classification';
import type { GoalMode } from './goals';
import { getGoal } from './goals';
import type { SpecialListItem } from './summary';
import { computeSummary } from './summary';
import type { Collaborator, Goal, Sale } from './types';

export interface ChampionStar {
  key: GoalCategoryKey;
  label: string;
  achieved: boolean;
}

// The 5 categories currently tracked for the star rating. Dynamic on
// purpose — adding or removing a tracked category later is a one-line
// change here, no changes needed in the champion card components
// (DashboardPage.tsx / MobileInicioPage.tsx just render whatever this
// returns).
export const CHAMPION_STAR_CATEGORIES: { key: GoalCategoryKey; label: string }[] = [
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
  goals: Partial<Record<GoalCategoryKey, Goal>>,
  specialLists: { levmel: SpecialListItem[]; chip: SpecialListItem[] } | undefined,
  from: string,
  to: string,
  mode: GoalMode,
): ChampionStar[] {
  return CHAMPION_STAR_CATEGORIES.map(({ key, label }) => {
    const goal = goals[key];
    const meta = getGoal(goal, mode, sales, collaborators);
    if (!goal || meta <= 0) return { key, label, achieved: false };
    const rows = computeSummary(sales, collaborators, from, to, key, specialLists);
    const row = rows.find((r) => r.matricula === matricula);
    if (!row) return { key, label, achieved: false };
    const realizado = goal.metrica === 'unidade' ? row.itens : row.valor;
    return { key, label, achieved: realizado >= meta };
  });
}
