// Ported 1:1 from legacy/index-original.html (btnDistribuirAuto handler in bindMetas).
import { computeMetaDiariaRedistribuida, diasRestantesNoMes } from './goals';
import type { Collaborator, Goal, Sale } from './types';

export interface IndividualGoalEntry {
  matricula: string;
  valorMeta: number;
  valorSuper: number;
  participa: boolean;
}

/**
 * Splits the remaining target for a category equally among the participating
 * collaborators. When the category's auto-redistribute is on, the pool split
 * is the *remaining* amount needed this month (computeMetaDiariaRedistribuida's
 * daily value re-expanded to the full remaining period), matching the legacy
 * quirk exactly rather than the nominal monthly goal.
 */
export function distributeIndividualGoalsAuto(
  goal: Goal,
  alvo: 'meta' | 'super',
  participantMatriculas: string[],
  sales: Sale[],
  collaborators: Collaborator[],
  now = new Date(),
): Record<string, number> {
  if (participantMatriculas.length === 0) return {};
  const campoMensal = alvo === 'meta' ? 'mensal' : 'superMeta';
  const autoAtivo = alvo === 'meta' ? goal.autoRedistribuir : goal.superMetaAuto;
  const metaTotal = autoAtivo
    ? computeMetaDiariaRedistribuida(goal, sales, collaborators, campoMensal, now) * diasRestantesNoMes(now)
    : Number(goal[campoMensal]) || 0;
  const valorPorPessoa = metaTotal / participantMatriculas.length;
  const rounded = Math.round(valorPorPessoa * 100) / 100;
  const result: Record<string, number> = {};
  participantMatriculas.forEach((mat) => (result[mat] = rounded));
  return result;
}
