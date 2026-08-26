import { describe, expect, it } from 'vitest';
import { computeColumnRanking, medalClass, podiumHeightPx } from './ranking';
import type { Collaborator, Sale } from './types';

const collaborators: Collaborator[] = [
  { id: '1', matricula: 'M1', nome: 'Ana', apelido: 'Ana', foto: null, setor: 'Balcão', metaIndividual: 3100 },
  { id: '2', matricula: 'M2', nome: 'Bruno', apelido: 'Bruno', foto: null, setor: 'Caixa', metaIndividual: 0 },
];

const sales: Sale[] = [
  { id: 's1', dataISO: '2026-08-10', matricula: 'M1', vendedor: 'Ana', produto: 'A', qtd: 1, valor: 200, grupo: 'MER' },
  { id: 's2', dataISO: '2026-08-10', matricula: 'M2', vendedor: 'Bruno', produto: 'B', qtd: 1, valor: 500, grupo: 'MER' },
];

describe('computeColumnRanking', () => {
  it('prorates the monthly individual goal by days-in-month for "dia" mode', () => {
    const ranking = computeColumnRanking(sales, collaborators, '2026-08-10', '2026-08-10', 'MER', false, 'dia', 2026, 7);
    const ana = ranking.find((r) => r.matricula === 'M1')!;
    // August has 31 days; daily goal = 3100/31 = 100; realized 200 -> 200%
    expect(ana.pct).toBeCloseTo((200 / (3100 / 31)) * 100);
  });

  it('uses the full monthly goal in "mes" mode', () => {
    const ranking = computeColumnRanking(sales, collaborators, '2026-08-01', '2026-08-31', 'MER', false, 'mes', 2026, 7);
    const ana = ranking.find((r) => r.matricula === 'M1')!;
    expect(ana.pct).toBeCloseTo((200 / 3100) * 100);
  });

  it('is null when the collaborator has no individual goal set', () => {
    const ranking = computeColumnRanking(sales, collaborators, null, null, 'MER', false, 'mes', 2026, 7);
    const bruno = ranking.find((r) => r.matricula === 'M2')!;
    expect(bruno.pct).toBeNull();
  });

  it('caps the percentage at 999', () => {
    const tinyGoalCollabs: Collaborator[] = [{ ...collaborators[0], metaIndividual: 1 }];
    const onlyAnaSale = [sales[0]];
    const ranking = computeColumnRanking(onlyAnaSale, tinyGoalCollabs, null, null, 'MER', false, 'mes', 2026, 7);
    expect(ranking[0].pct).toBe(999);
  });

  it('excludes rows with zero sales in the given metric', () => {
    const ranking = computeColumnRanking(sales, collaborators, null, null, 'MER', false, 'mes', 2026, 7);
    expect(ranking.every((r) => r.valor > 0)).toBe(true);
  });
});

describe('podiumHeightPx', () => {
  it('decreases by 8px per position, floored at 140', () => {
    expect(podiumHeightPx(0)).toBe(220);
    expect(podiumHeightPx(1)).toBe(212);
    expect(podiumHeightPx(20)).toBe(140);
  });
});

describe('medalClass', () => {
  it('assigns gold/silver/bronze to the top 3, null after', () => {
    expect(medalClass(0)).toBe('gold');
    expect(medalClass(1)).toBe('silver');
    expect(medalClass(2)).toBe('bronze');
    expect(medalClass(3)).toBeNull();
  });
});
