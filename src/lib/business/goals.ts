// Ported 1:1 from legacy/index-original.html (getGoal / getSuperMeta /
// computeMetaDiariaRedistribuida / effectiveMetaGeral / bioDiasRestantes).
import type { CategoryKey } from './classification';
import { computeSummary } from './summary';
import type { Collaborator, Goal, Sale } from './types';

export type GoalMode = 'dia' | 'mes';

/** Ratio inputs for prorating a monthly goal down to a "período
 * personalizado" — any multi-day range shorter than the whole calendar
 * month. Day mode and the whole-month range (`modoGeral`) don't need this;
 * both already compare against the goal as registered. */
export interface GoalProration {
  periodDays: number;
  monthDays: number;
}

/** Builds the proration input for `getGoal`/`getSuperMeta`/
 * `effectiveMetaGeral` from the dashboard's current date-range selection —
 * `undefined` (no proration) for a single day or for `modoGeral` (the
 * literal calendar month), a {periodDays, monthDays} ratio for anything
 * else. `monthDays` is taken from the month `dashFrom` falls in; a range
 * spanning two different months is a rare edge case this approximates
 * rather than handling exactly. */
export function goalProration(dashFrom: string, dashTo: string, modoGeral: boolean): GoalProration | undefined {
  if (modoGeral || dashFrom === dashTo) return undefined;
  const from = new Date(`${dashFrom}T00:00:00`);
  const to = new Date(`${dashTo}T00:00:00`);
  const periodDays = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const monthDays = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  if (periodDays <= 0 || periodDays >= monthDays) return undefined;
  return { periodDays, monthDays };
}

/** Days remaining in the current month, counting today (used both for goal
 * redistribution and the BIOSINTÉTICA "days left" indicator). */
export function diasRestantesNoMes(now = new Date()): number {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(0, Math.ceil((lastDay.getTime() - now.getTime()) / 86400000));
}

/**
 * Automatic redistribution: (target goal for the month - already sold this
 * month) / days remaining in the month. Uses whichever metric (R$ or units)
 * is configured for the category. `campo` selects mensal vs superMeta as the target.
 */
export function computeMetaDiariaRedistribuida(
  goal: Goal | undefined,
  sales: Sale[],
  collaborators: Collaborator[],
  campo: 'mensal' | 'superMeta' = 'mensal',
  now = new Date(),
): number {
  const g = goal || ({ mensal: 0, superMeta: 0, metrica: 'valor' } as Goal);
  const metaAlvo = Number(g[campo]) || 0;
  if (metaAlvo <= 0) return 0;

  const monthFirst = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const hojeISO = now.toISOString().slice(0, 10);
  const rows = computeSummary(sales, collaborators, monthFirst, hojeISO, g.categoria);
  const realizado =
    g.metrica === 'unidade'
      ? rows.reduce((a, r) => a + r.itens, 0)
      : rows.reduce((a, r) => a + r.valor, 0);
  const restante = Math.max(0, metaAlvo - realizado);
  const diasRestantes = Math.max(1, diasRestantesNoMes(now));
  return restante / diasRestantes;
}

export function getGoal(
  goal: Goal | undefined,
  mode: GoalMode,
  sales: Sale[],
  collaborators: Collaborator[],
  proration?: GoalProration,
  now = new Date(),
): number {
  const g = goal || ({ mensal: 0, diaria: 0 } as Goal);
  if (mode === 'dia' && g.autoRedistribuir) {
    return computeMetaDiariaRedistribuida(g, sales, collaborators, 'mensal', now);
  }
  const base = mode === 'dia' ? Number(g.diaria) || 0 : Number(g.mensal) || 0;
  if (mode === 'mes' && proration) return base * (proration.periodDays / proration.monthDays);
  return base;
}

export function getSuperMeta(
  goal: Goal | undefined,
  mode: GoalMode,
  sales: Sale[],
  collaborators: Collaborator[],
  proration?: GoalProration,
  now = new Date(),
): number {
  const g = goal || ({ superMeta: 0 } as Goal);
  if (mode === 'dia' && g.superMetaAuto) {
    return computeMetaDiariaRedistribuida(g, sales, collaborators, 'superMeta', now);
  }
  const base = Number(g.superMeta) || 0;
  if (mode === 'mes' && proration) return base * (proration.periodDays / proration.monthDays);
  return base;
}

/** "Meta Geral" always prioritizes the goal registered for MER (Mercadoria Geral). */
export function effectiveMetaGeral(
  goals: Record<CategoryKey, Goal | undefined>,
  mode: GoalMode,
  sales: Sale[],
  collaborators: Collaborator[],
  metaGeralFallback: number,
  proration?: GoalProration,
  now = new Date(),
): number {
  const merGoal = getGoal(goals.MER, mode, sales, collaborators, proration, now);
  if (merGoal > 0) return merGoal;
  if (mode === 'dia') return 0;
  const base = Number(metaGeralFallback) || 0;
  return proration ? base * (proration.periodDays / proration.monthDays) : base;
}
