import { describe, expect, it } from 'vitest';
import { computeChampionStars } from './champion';
import type { Collaborator, Sale } from './types';

const collaborators: Collaborator[] = [
  { id: '1', matricula: 'M1', nome: 'Ana', apelido: 'Ana', foto: null, setor: 'Balcão', metaIndividual: 0 },
  { id: '2', matricula: 'M2', nome: 'Bruno', apelido: 'Bruno', foto: null, setor: 'Balcão', metaIndividual: 0 },
];

// DERM tier-1 is 3000, GEN tier-1 is 1000, LEVMEL tier-1 is 5 un — see
// CONQUISTA_TIERS_BY_CAT in conquistas.ts.
const sales: Sale[] = [
  { id: 's1', dataISO: '2026-08-05', matricula: 'M1', vendedor: 'Ana', produto: 'Cerave', qtd: 1, valor: 3500, grupo: 'DERM' },
  { id: 's2', dataISO: '2026-08-06', matricula: 'M1', vendedor: 'Ana', produto: 'Levmel Xarope', qtd: 10, valor: 150, grupo: null },
  { id: 's3', dataISO: '2026-08-07', matricula: 'M2', vendedor: 'Bruno', produto: 'Generico X', qtd: 1, valor: 500, grupo: 'GEN' },
];

const specialLists = { levmel: [{ nome: 'Levmel', palavras: ['levmel'] }], chip: [] };

describe('computeChampionStars', () => {
  it('marks a category achieved when the champion alone reached its first Galeria de Conquistas tier', () => {
    const stars = computeChampionStars('M1', sales, collaborators, specialLists, '2026-08-01', '2026-08-31');
    const derm = stars.find((s) => s.key === 'DERM')!;
    const levmel = stars.find((s) => s.key === 'LEVMEL')!;
    expect(derm.achieved).toBe(true); // 3500 >= 3000 (DERM tier 1)
    expect(levmel.achieved).toBe(true); // 10 un >= 5 un (LEVMEL tier 1)
  });

  it('marks a category not achieved when below the first tier or no sales in it', () => {
    const stars = computeChampionStars('M2', sales, collaborators, specialLists, '2026-08-01', '2026-08-31');
    const gen = stars.find((s) => s.key === 'GEN')!;
    const mp = stars.find((s) => s.key === 'MP')!;
    const chip = stars.find((s) => s.key === 'CHIP')!;
    expect(gen.achieved).toBe(false); // 500 < 1000 (GEN tier 1)
    expect(mp.achieved).toBe(false); // no sales in MP
    expect(chip.achieved).toBe(false); // no sales in CHIP
  });

  it('returns one entry per tracked category, in a stable order', () => {
    const stars = computeChampionStars('M1', sales, collaborators, specialLists, '2026-08-01', '2026-08-31');
    expect(stars.map((s) => s.key)).toEqual(['DERM', 'GEN', 'MP', 'LEVMEL', 'CHIP']);
  });
});
