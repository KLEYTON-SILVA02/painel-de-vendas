import { describe, expect, it } from 'vitest';
import {
  computeDinamicaProgresso,
  computeDinamicaRanking,
  intersectDynamicPeriod,
  isDynamicActive,
} from './dynamics';
import type { Collaborator, Dynamic, Sale } from './types';

const collaborators: Collaborator[] = [
  { id: '1', matricula: 'M1', nome: 'Ana', apelido: 'Ana', foto: null, setor: 'Balcão', metaIndividual: 0 },
  { id: '2', matricula: 'M2', nome: 'Bruno', apelido: 'Bruno', foto: null, setor: 'Caixa', metaIndividual: 0 },
];

const sales: Sale[] = [
  { id: 's1', dataISO: '2026-08-05', matricula: 'M1', vendedor: 'Ana', produto: 'Produto X', qtd: 2, valor: 200, grupo: 'DERM' },
  { id: 's2', dataISO: '2026-08-06', matricula: 'M2', vendedor: 'Bruno', produto: 'Produto X', qtd: 1, valor: 100, grupo: 'DERM' },
  { id: 's3', dataISO: '2026-08-06', matricula: 'M2', vendedor: 'Bruno', produto: 'Produto Y (not in list)', qtd: 5, valor: 500, grupo: 'DERM' },
  { id: 's4', dataISO: '2026-07-20', matricula: 'M1', vendedor: 'Ana', produto: 'Produto X', qtd: 9, valor: 900, grupo: 'DERM' }, // outside period
];

const din: Dynamic = {
  id: 'd1', titulo: 'Semana X', descricao: '', dataInicio: '2026-08-01', dataFim: '2026-08-10',
  metaValor: 500, metrica: 'valor', produtos: ['Produto X'], participantes: [],
};

describe('computeDinamicaProgresso', () => {
  it('sums only sales within the period, matching the product list', () => {
    expect(computeDinamicaProgresso(din, sales)).toBe(300); // s1 + s2 only
  });

  it('uses unit count when metrica is unidade', () => {
    expect(computeDinamicaProgresso({ ...din, metrica: 'unidade' }, sales)).toBe(3); // qtd 2 + 1
  });

  it('counts every product when the product list is empty', () => {
    expect(computeDinamicaProgresso({ ...din, produtos: [] }, sales)).toBe(800); // s1+s2+s3
  });
});

describe('computeDinamicaRanking', () => {
  it('ranks participants by the dynamic metric, restricted to the product list', () => {
    const ranking = computeDinamicaRanking(din, sales, collaborators);
    const bruno = ranking.find((r) => r.matricula === 'M2')!;
    const ana = ranking.find((r) => r.matricula === 'M1')!;
    expect(ana.valor).toBe(200);
    expect(bruno.valor).toBe(100); // Produto Y excluded
  });

  it('restricts to the participant list when set', () => {
    const ranking = computeDinamicaRanking({ ...din, participantes: ['M1'] }, sales, collaborators);
    expect(ranking).toHaveLength(1);
    expect(ranking[0].matricula).toBe('M1');
  });
});

describe('isDynamicActive', () => {
  it('is active while today <= end date', () => {
    expect(isDynamicActive(din, '2026-08-10')).toBe(true);
    expect(isDynamicActive(din, '2026-08-01')).toBe(true);
  });
  it('is inactive the day after it ends', () => {
    expect(isDynamicActive(din, '2026-08-11')).toBe(false);
  });
});

describe('intersectDynamicPeriod', () => {
  it('clamps to the tighter bound on each side', () => {
    expect(intersectDynamicPeriod(din, '2026-08-03', '2026-08-20')).toEqual({ from: '2026-08-03', to: '2026-08-10' });
    expect(intersectDynamicPeriod(din, '2026-07-01', '2026-08-05')).toEqual({ from: '2026-08-01', to: '2026-08-05' });
  });
});
