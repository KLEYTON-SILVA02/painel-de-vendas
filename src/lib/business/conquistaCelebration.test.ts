import { describe, expect, it } from 'vitest';
import { celebrationKey, pickNewCelebration, type CelebrationCandidate } from './conquistaCelebration';
import type { ConquistaRow } from './conquistas';

function row(matricula: string, tier: ConquistaRow['tier']): ConquistaRow {
  return {
    matricula,
    nome: matricula,
    apelido: matricula,
    foto: null,
    metaIndividual: 0,
    qtd: { DERM: 0, GEN: 0, MP: 0, MER: 0, SEM: 0 },
    valor: 5000,
    itens: 1,
    tier,
  };
}

describe('celebrationKey', () => {
  it('is stable for the same achiever/category/tier/month and differs when any of those change', () => {
    const a = row('M1', 3000);
    expect(celebrationKey('DERM', a, '2026-08')).toBe(celebrationKey('DERM', a, '2026-08'));
    expect(celebrationKey('DERM', a, '2026-08')).not.toBe(celebrationKey('DERM', a, '2026-09'));
    expect(celebrationKey('DERM', a, '2026-08')).not.toBe(celebrationKey('GEN', a, '2026-08'));
    expect(celebrationKey('DERM', row('M1', 3000), '2026-08')).not.toBe(celebrationKey('DERM', row('M1', 5000), '2026-08'));
  });
});

describe('pickNewCelebration', () => {
  const candidates: CelebrationCandidate[] = [
    { key: 'k1', categoria: 'DERM', row: row('M1', 1000) },
    { key: 'k2', categoria: 'DERM', row: row('M2', 3000) },
  ];

  it('celebrates nothing on the first-ever run, but records the baseline keys', () => {
    const result = pickNewCelebration(candidates, new Set(), true);
    expect(result.toCelebrate).toBeNull();
    expect(result.allKeys).toEqual(['k1', 'k2']);
  });

  it('picks the first candidate not already in the seen set', () => {
    const result = pickNewCelebration(candidates, new Set(['k1']), false);
    expect(result.toCelebrate?.key).toBe('k2');
  });

  it('celebrates nothing when every candidate was already seen', () => {
    const result = pickNewCelebration(candidates, new Set(['k1', 'k2']), false);
    expect(result.toCelebrate).toBeNull();
  });
});
