// Ported 1:1 from legacy/index-original.html (getGoal / getSuperMeta /
// computeMetaDiariaRedistribuida / effectiveMetaGeral / bioDiasRestantes).
import type { CategoryKey } from './classification';
import { computeSummary } from './summary';
import type { Collaborator, Goal, Sale } from './types';

export type GoalMode = 'dia' | 'mes';

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
  now = new Date(),
): number {
  const g = goal || ({ mensal: 0, diaria: 0 } as Goal);
  if (mode === 'dia' && g.autoRedistribuir) {
    return computeMetaDiariaRedistribuida(g, sales, collaborators, 'mensal', now);
  }
  return mode === 'dia' ? Number(g.diaria) || 0 : Number(g.mensal) || 0;
}

export function getSuperMeta(
  goal: Goal | undefined,
  mode: GoalMode,
  sales: Sale[],
  collaborators: Collaborator[],
  now = new Date(),
): number {
  const g = goal || ({ superMeta: 0 } as Goal);
  if (mode === 'dia' && g.superMetaAuto) {
    return computeMetaDiariaRedistribuida(g, sales, collaborators, 'superMeta', now);
  }
  return Number(g.superMeta) || 0;
}

/** "Meta Geral" always prioritizes the goal registered for MER (Mercadoria Geral). */
export function effectiveMetaGeral(
  goals: Record<CategoryKey, Goal | undefined>,
  mode: GoalMode,
  sales: Sale[],
  collaborators: Collaborator[],
  metaGeralFallback: number,
  now = new Date(),
): number {
  const merGoal = getGoal(goals.MER, mode, sales, collaborators, now);
  if (merGoal > 0) return merGoal;
  return mode === 'dia' ? 0 : Number(metaGeralFallback) || 0;
}
