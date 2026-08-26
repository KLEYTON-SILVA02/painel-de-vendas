process.env.TZ = 'UTC';
import { describe, expect, it } from 'vitest';
import { distributeIndividualGoalsAuto } from './individualGoals';
import type { Collaborator, Goal, Sale } from './types';

const collaborators: Collaborator[] = [
  { id: '1', matricula: 'M1', nome: 'Ana', apelido: 'Ana', foto: null, setor: 'Balcão', metaIndividual: 0 },
];
const sales: Sale[] = [];
const now = new Date(2026, 7, 10, 12, 0, 0);

describe('distributeIndividualGoalsAuto', () => {
  it('splits the fixed monthly target equally when auto-redistribute is off', () => {
    const goal: Goal = {
      categoria: 'MER', mensal: 3000, diaria: 0, metrica: 'valor',
      autoRedistribuir: false, superMeta: 0, superMetaAuto: false,
    };
    const result = distributeIndividualGoalsAuto(goal, 'meta', ['M1', 'M2', 'M3'], sales, collaborators, now);
    expect(result).toEqual({ M1: 1000, M2: 1000, M3: 1000 });
  });

  it('splits the remaining amount (not the nominal goal) when auto-redistribute is on', () => {
    const salesWithProgress: Sale[] = [
      { id: 's1', dataISO: '2026-08-01', matricula: 'M1', vendedor: 'Ana', produto: 'A', qtd: 1, valor: 1000, grupo: 'MER' },
    ];
    const goal: Goal = {
      categoria: 'MER', mensal: 3100, diaria: 0, metrica: 'valor',
      autoRedistribuir: true, superMeta: 0, superMetaAuto: false,
    };
    // daily = (3100-1000)/21 = 100; total redistributed = 100*21 = 2100; split among 2 -> 1050 each
    const result = distributeIndividualGoalsAuto(goal, 'meta', ['M1', 'M2'], salesWithProgress, collaborators, now);
    expect(result.M1).toBeCloseTo(1050);
    expect(result.M2).toBeCloseTo(1050);
  });

  it('returns an empty object when there are no participants', () => {
    const goal: Goal = {
      categoria: 'MER', mensal: 3000, diaria: 0, metrica: 'valor',
      autoRedistribuir: false, superMeta: 0, superMetaAuto: false,
    };
    expect(distributeIndividualGoalsAuto(goal, 'meta', [], sales, collaborators, now)).toEqual({});
  });
});
