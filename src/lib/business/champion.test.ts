import { describe, expect, it } from 'vitest';
import { computeChampionStars } from './champion';
import type { Collaborator, Goal, Sale } from './types';

const collaborators: Collaborator[] = [
  { id: '1', matricula: 'M1', nome: 'Ana', apelido: 'Ana', foto: null, setor: 'Balcão', metaIndividual: 0 },
  { id: '2', matricula: 'M2', nome: 'Bruno', apelido: 'Bruno', foto: null, setor: 'Balcão', metaIndividual: 0 },
];

const sales: Sale[] = [
  { id: 's1', dataISO: '2026-08-05', matricula: 'M1', vendedor: 'Ana', produto: 'Cerave', qtd: 1, valor: 300, grupo: 'DERM' },
  { id: 's2', dataISO: '2026-08-06', matricula: 'M1', vendedor: 'Ana', produto: 'Levmel Xarope', qtd: 10, valor: 150, grupo: null },
  { id: 's3', dataISO: '2026-08-07', matricula: 'M2', vendedor: 'Bruno', produto: 'Generico X', qtd: 1, valor: 50, grupo: 'GEN' },
];

const goals: Partial<Record<'DERM' | 'GEN' | 'MP' | 'LEVMEL' | 'CHIP', Goal>> = {
  DERM: { categoria: 'DERM', mensal: 200, diaria: 0, metrica: 'valor', autoRedistribuir: false, superMeta: 0, superMetaAuto: false },
  GEN: { categoria: 'GEN', mensal: 100, diaria: 0, metrica: 'valor', autoRedistribuir: false, superMeta: 0, superMetaAuto: false },
  LEVMEL: { categoria: 'LEVMEL', mensal: 5, diaria: 0, metrica: 'unidade', autoRedistribuir: false, superMeta: 0, superMetaAuto: false },
};

const specialLists = { levmel: [{ nome: 'Levmel', palavras: ['levmel'] }], chip: [] };

describe('computeChampionStars', () => {
  it('marks a category achieved when the champion alone reached the store goal', () => {
    const stars = computeChampionStars('M1', sales, collaborators, goals, specialLists, '2026-08-01', '2026-08-31', 'mes');
    const derm = stars.find((s) => s.key === 'DERM')!;
    const levmel = stars.find((s) => s.key === 'LEVMEL')!;
    expect(derm.achieved).toBe(true); // 300 >= 200
    expect(levmel.achieved).toBe(true); // 10 un >= 5 un
  });

  it('marks a category not achieved when below the goal or no goal configured', () => {
    const stars = computeChampionStars('M2', sales, collaborators, goals, specialLists, '2026-08-01', '2026-08-31', 'mes');
    const gen = stars.find((s) => s.key === 'GEN')!;
    const mp = stars.find((s) => s.key === 'MP')!;
    const chip = stars.find((s) => s.key === 'CHIP')!;
    expect(gen.achieved).toBe(false); // 50 < 100
    expect(mp.achieved).toBe(false); // no sales in MP
    expect(chip.achieved).toBe(false); // no goal configured (meta <= 0)
  });

  it('returns one entry per tracked category, in a stable order', () => {
    const stars = computeChampionStars('M1', sales, collaborators, goals, specialLists, '2026-08-01', '2026-08-31', 'mes');
    expect(stars.map((s) => s.key)).toEqual(['DERM', 'GEN', 'MP', 'LEVMEL', 'CHIP']);
  });
});
