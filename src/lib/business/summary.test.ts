import { describe, expect, it } from 'vitest';
import { catTotals, computeSummary, computeVendorExtract, daysSince, lastSaleDateFor, matchesSpecialList } from './summary';
import type { Collaborator, Sale } from './types';

const collaborators: Collaborator[] = [
  { id: '1', matricula: 'M1', nome: 'Ana', apelido: 'Ana', foto: null, setor: 'Balcão', metaIndividual: 0 },
  { id: '2', matricula: 'M2', nome: 'Bruno', apelido: 'Bruno', foto: null, setor: 'Caixa', metaIndividual: 0 },
  { id: '3', matricula: 'M3', nome: 'Carla Souza Lima', apelido: null, foto: null, setor: 'Balcão', metaIndividual: 0 },
];

const sales: Sale[] = [
  { id: 's1', dataISO: '2026-08-01', matricula: 'M1', vendedor: 'Ana', produto: 'Produto A', qtd: 2, valor: 100, grupo: 'DERM' },
  { id: 's2', dataISO: '2026-08-05', matricula: 'M1', vendedor: 'Ana', produto: 'Produto B', qtd: 1, valor: 50, grupo: 'MER' },
  { id: 's3', dataISO: '2026-08-10', matricula: 'M2', vendedor: 'Bruno', produto: 'Produto A', qtd: 3, valor: 150, grupo: 'DERM' },
  { id: 's4', dataISO: '2026-07-31', matricula: 'M2', vendedor: 'Bruno', produto: 'Produto C', qtd: 1, valor: 10, grupo: 'MER' },
  { id: 's5', dataISO: '2026-08-03', matricula: 'M9', vendedor: 'Desconhecido', produto: 'Produto D', qtd: 1, valor: 5, grupo: 'MER' },
];

describe('computeSummary', () => {
  it('sums per collaborator within the date range, seeding zero rows for every collaborator', () => {
    const rows = computeSummary(sales, collaborators, '2026-08-01', '2026-08-31');
    const ana = rows.find((r) => r.matricula === 'M1')!;
    const bruno = rows.find((r) => r.matricula === 'M2')!;
    expect(ana.valor).toBe(150);
    expect(ana.itens).toBe(3);
    expect(bruno.valor).toBe(150); // 2026-07-31 sale excluded by range
    expect(bruno.itens).toBe(3);
  });

  it('falls back to just the first name when no apelido is registered', () => {
    const rows = computeSummary(sales, collaborators, null, null);
    const carla = rows.find((r) => r.matricula === 'M3')!;
    expect(carla.apelido).toBe('Carla');
  });

  it('synthesizes a row for an unregistered matricula found in sales', () => {
    const rows = computeSummary(sales, collaborators, '2026-08-01', '2026-08-31');
    const unknown = rows.find((r) => r.matricula === 'M9');
    expect(unknown).toBeDefined();
    expect(unknown!.nome).toBe('Desconhecido');
  });

  it('filters by category', () => {
    const rows = computeSummary(sales, collaborators, null, null, 'DERM');
    const total = rows.reduce((a, r) => a + r.valor, 0);
    expect(total).toBe(250); // s1 + s3
  });

  it('sorts descending by value', () => {
    const rows = computeSummary(sales, collaborators, null, null);
    expect(rows[0].valor).toBeGreaterThanOrEqual(rows[1]?.valor ?? 0);
  });
});

describe('catTotals', () => {
  it('sums qty/value for a single category', () => {
    expect(catTotals(sales, null, null, 'MER')).toEqual({ qtd: 3, valor: 65 });
  });
});

describe('matchesSpecialList', () => {
  it('matches a product name against keyword list', () => {
    const list = [{ nome: 'Levmel', palavras: ['levmel'] }];
    expect(matchesSpecialList('Levmel Suplemento 30cp', list)).toBe(true);
    expect(matchesSpecialList('Outro Produto', list)).toBe(false);
  });
});

describe('computeVendorExtract', () => {
  it('filters by matricula, category and date range, newest first', () => {
    const extract = computeVendorExtract(sales, 'M1', 'DERM', '2026-08-01', '2026-08-31');
    expect(extract.map((s) => s.id)).toEqual(['s1']);
  });

  it('filters by special list membership for LEVMEL/CHIP', () => {
    const specialLists = { levmel: [{ nome: 'Produto A', palavras: ['produto a'] }], chip: [] };
    const extract = computeVendorExtract(sales, 'M1', 'LEVMEL', null, null, specialLists);
    expect(extract.map((s) => s.id)).toEqual(['s1']);
  });

  it('returns everything for the matricula when catKey is ALL', () => {
    const extract = computeVendorExtract(sales, 'M1', 'ALL', null, null);
    expect(extract.map((s) => s.id).sort()).toEqual(['s1', 's2']);
  });
});

describe('lastSaleDateFor / daysSince', () => {
  it('finds the most recent sale date for a matricula', () => {
    expect(lastSaleDateFor(sales, 'M1')).toBe('2026-08-05');
  });
  it('returns null when there is no sale', () => {
    expect(lastSaleDateFor(sales, 'M404')).toBeNull();
  });
  it('computes days since a date', () => {
    expect(daysSince(null)).toBeNull();
    expect(daysSince('2020-01-01')).toBeGreaterThan(365);
  });
});
