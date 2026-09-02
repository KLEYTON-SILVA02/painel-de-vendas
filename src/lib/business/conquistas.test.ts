import { describe, expect, it } from 'vitest';
import { computeConquistas, computeConquistasDayGallery, conquistaTierLabel, conquistaTierParts } from './conquistas';
import type { Collaborator, Sale } from './types';

const collaborators: Collaborator[] = [
  { id: '1', matricula: 'M1', nome: 'Ana', apelido: 'Ana', foto: null, setor: 'Balcão', metaIndividual: 0 },
  { id: '2', matricula: 'M2', nome: 'Bruno', apelido: 'Bruno', foto: null, setor: 'Caixa', metaIndividual: 0 },
  { id: '3', matricula: 'M3', nome: 'Carla', apelido: 'Carla', foto: null, setor: 'Balcão', metaIndividual: 0 },
];

const sales: Sale[] = [
  { id: 's1', dataISO: '2026-08-01', matricula: 'M1', vendedor: 'Ana', produto: 'A', qtd: 1, valor: 3500, grupo: 'DERM' },
  { id: 's2', dataISO: '2026-08-02', matricula: 'M2', vendedor: 'Bruno', produto: 'B', qtd: 1, valor: 6000, grupo: 'DERM' },
  { id: 's3', dataISO: '2026-08-03', matricula: 'M3', vendedor: 'Carla', produto: 'C', qtd: 1, valor: 300, grupo: 'DERM' },
];

describe('computeConquistas', () => {
  it('assigns the highest fixed tier reached and excludes those below every tier', () => {
    const rows = computeConquistas(sales, collaborators, '2026-08-01', '2026-08-31', 'DERM');
    expect(rows.map((r) => r.matricula)).toEqual(['M2', 'M1']); // Carla's 300 hits nothing
    expect(rows.find((r) => r.matricula === 'M2')!.tier).toBe(5000); // 6000 >= 5000, < 10000
    expect(rows.find((r) => r.matricula === 'M1')!.tier).toBe(3000); // 3500 >= 3000, < 5000
  });

  it('uses per-category tiers — Marcas Exclusivas/Genéricos start at 1K, not 3K', () => {
    const mpSales: Sale[] = [{ id: 'mp1', dataISO: '2026-08-01', matricula: 'M1', vendedor: 'Ana', produto: 'X', qtd: 1, valor: 1500, grupo: 'MP' }];
    const rows = computeConquistas(mpSales, collaborators, '2026-08-01', '2026-08-31', 'MP');
    expect(rows.find((r) => r.matricula === 'M1')!.tier).toBe(1000);
  });

  it('measures Levmel/Chip achievements in units sold, not R$', () => {
    const specialLists = { levmel: [{ nome: 'Levmel Especial', palavras: ['levmel especial'] }], chip: [] };
    const levmelSales: Sale[] = [
      { id: 'l1', dataISO: '2026-08-01', matricula: 'M1', vendedor: 'Ana', produto: 'Levmel Especial', qtd: 12, valor: 0, grupo: null },
    ];
    const rows = computeConquistas(levmelSales, collaborators, '2026-08-01', '2026-08-31', 'LEVMEL', specialLists);
    expect(rows.find((r) => r.matricula === 'M1')!.tier).toBe(10); // 12 un. >= 10, < 15
  });

  it('never accumulates across days — a tier must be reached within a single day', () => {
    // 1800 + 1800 = 3600 would clear DERM's first tier (3000) if summed
    // across the month, but neither day alone does.
    const splitSales: Sale[] = [
      { id: 'sp1', dataISO: '2026-08-01', matricula: 'M1', vendedor: 'Ana', produto: 'A', qtd: 1, valor: 1800, grupo: 'DERM' },
      { id: 'sp2', dataISO: '2026-08-02', matricula: 'M1', vendedor: 'Ana', produto: 'A', qtd: 1, valor: 1800, grupo: 'DERM' },
    ];
    const rows = computeConquistas(splitSales, collaborators, '2026-08-01', '2026-08-31', 'DERM');
    expect(rows.find((r) => r.matricula === 'M1')).toBeUndefined();
  });

  it('keeps the best single day when multiple days each reach a tier on their own', () => {
    const multiDaySales: Sale[] = [
      { id: 'md1', dataISO: '2026-08-01', matricula: 'M1', vendedor: 'Ana', produto: 'A', qtd: 1, valor: 3500, grupo: 'DERM' }, // tier 3000
      { id: 'md2', dataISO: '2026-08-15', matricula: 'M1', vendedor: 'Ana', produto: 'A', qtd: 1, valor: 6000, grupo: 'DERM' }, // tier 5000, better
    ];
    const rows = computeConquistas(multiDaySales, collaborators, '2026-08-01', '2026-08-31', 'DERM');
    expect(rows.find((r) => r.matricula === 'M1')!.tier).toBe(5000);
    expect(rows.find((r) => r.matricula === 'M1')!.valor).toBe(6000);
  });

  it('caps at the top 10 sorted by the category metric desc', () => {
    const many: Collaborator[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      matricula: `X${i}`,
      nome: `V${i}`,
      apelido: `V${i}`,
      foto: null,
      setor: 'Balcão',
      metaIndividual: 0,
    }));
    const manySales: Sale[] = many.map((c, i) => ({
      id: `s${i}`,
      dataISO: '2026-08-01',
      matricula: c.matricula,
      vendedor: c.nome,
      produto: 'X',
      qtd: 1,
      valor: 3000 + i * 100,
      grupo: 'DERM',
    }));
    const rows = computeConquistas(manySales, many, '2026-08-01', '2026-08-31', 'DERM');
    expect(rows).toHaveLength(10);
    expect(rows[0].matricula).toBe('X11'); // highest valor first
  });
});

describe('computeConquistasDayGallery', () => {
  it('lists every day in range newest-first with that day\'s achiever count', () => {
    const gallery = computeConquistasDayGallery(sales, collaborators, '2026-08-01', '2026-08-03', 'DERM');
    expect(gallery.map((d) => d.dia)).toEqual(['2026-08-03', '2026-08-02', '2026-08-01']);
    expect(gallery.find((d) => d.dia === '2026-08-02')!.count).toBe(1); // Bruno's 6000
    expect(gallery.find((d) => d.dia === '2026-08-03')!.count).toBe(0); // Carla's 300 alone hits nothing
  });
});

describe('conquistaTierLabel', () => {
  it('formats R$ categories as "<N>K <categoria>"', () => {
    expect(conquistaTierLabel('DERM', 3000)).toBe('3K DERMOCOSMÉTICOS');
    expect(conquistaTierLabel('DERM', 10000)).toBe('10K DERMOCOSMÉTICOS');
    expect(conquistaTierLabel('MP', 1000)).toBe('1K MARCA PRÓPRIA');
    expect(conquistaTierLabel('GEN', 2000)).toBe('2K GENÉRICOS');
  });

  it('formats unit categories as "<N>un <categoria>"', () => {
    expect(conquistaTierLabel('LEVMEL', 5)).toBe('5un LEVMEL');
    expect(conquistaTierLabel('CHIP', 50)).toBe('50un CHIP');
  });
});

describe('conquistaTierParts', () => {
  it('splits into the same value/categoria halves conquistaTierLabel combines', () => {
    expect(conquistaTierParts('DERM', 3000)).toEqual({ valor: '3K', categoria: 'DERMOCOSMÉTICOS' });
    expect(conquistaTierParts('LEVMEL', 5)).toEqual({ valor: '5un', categoria: 'LEVMEL' });
  });
});
