import { describe, expect, it } from 'vitest';
import { computeArchiveAggregates } from './archival';
import type { BioGroupsProducts } from './business/types';
import type { Sale } from './business/types';

const specialLists = {
  levmel: [{ nome: 'Levmel', palavras: ['levmel'] }],
  chip: [{ nome: 'Chip', palavras: ['chip'] }],
};

const bioGroups: BioGroupsProducts = {
  G1: [{ nome: 'Grupo 1', palavras: ['biovita'] }],
  G2: [],
  G3: [],
  G4: [],
};

const sales: Sale[] = [
  { id: 's1', dataISO: '2026-05-01', matricula: 'M1', vendedor: 'Ana', produto: 'Hidratante', qtd: 2, valor: 100, grupo: 'DERM' },
  { id: 's2', dataISO: '2026-05-10', matricula: 'M1', vendedor: 'Ana', produto: 'Levmel Suplemento', qtd: 1, valor: 50, grupo: 'MER' },
  { id: 's3', dataISO: '2026-05-15', matricula: 'M2', vendedor: 'Bruno', produto: 'Biovita Complex', qtd: 1, valor: 80, grupo: 'MP' },
  { id: 's4', dataISO: '2026-06-01', matricula: 'M2', vendedor: 'Bruno', produto: 'Chip Levmel Combo', qtd: 3, valor: 30, grupo: null },
];

describe('computeArchiveAggregates', () => {
  it('buckets a sale into every category it matches (grupo + special list + bio group are independent tags)', () => {
    const { categorias } = computeArchiveAggregates(sales, specialLists, bioGroups);
    const byKey = new Map(categorias.map((c) => [`${c.year_month}|${c.categoria}`, c]));

    expect(byKey.get('2026-05-01|DERM')).toMatchObject({ valor_total: 100, itens_total: 2, vendas_total: 1 });
    expect(byKey.get('2026-05-01|LEVMEL')).toMatchObject({ valor_total: 50, itens_total: 1, vendas_total: 1 });
    expect(byKey.get('2026-05-01|MP')).toMatchObject({ valor_total: 80, itens_total: 1, vendas_total: 1 });
    expect(byKey.get('2026-05-01|G1')).toMatchObject({ valor_total: 80, itens_total: 1, vendas_total: 1 });
    // s4 has no grupo (null), matches both LEVMEL and CHIP by product name, in June.
    expect(byKey.get('2026-06-01|LEVMEL')).toMatchObject({ valor_total: 30, itens_total: 3, vendas_total: 1 });
    expect(byKey.get('2026-06-01|CHIP')).toMatchObject({ valor_total: 30, itens_total: 3, vendas_total: 1 });
    expect(byKey.has('2026-06-01|MER')).toBe(false);
  });

  it('sums a single total per collaborator per month regardless of category', () => {
    const { colaboradores } = computeArchiveAggregates(sales, specialLists, bioGroups);
    const ana = colaboradores.find((c) => c.matricula === 'M1' && c.year_month === '2026-05-01')!;
    expect(ana.valor_total).toBe(150);
    expect(ana.itens_total).toBe(3);
    expect(ana.nome).toBe('Ana');
  });

  it('ignores sales with no date', () => {
    const undated: Sale[] = [{ id: 'x', dataISO: null, matricula: 'M1', vendedor: 'Ana', produto: 'Produto', qtd: 1, valor: 10, grupo: 'MER' }];
    const { categorias, colaboradores } = computeArchiveAggregates(undated, specialLists, bioGroups);
    expect(categorias).toHaveLength(0);
    expect(colaboradores).toHaveLength(0);
  });
});
