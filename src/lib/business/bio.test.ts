import { describe, expect, it } from 'vitest';
import { auditBioOutsideBalcao, computeBioSummary, computeBioUnassigned } from './bio';
import type { BioGroupsProducts, BioWeights, Collaborator, Sale } from './types';

const collaborators: Collaborator[] = [
  { id: '1', matricula: 'M1', nome: 'Ana', apelido: 'Ana', foto: null, setor: 'Balcão', metaIndividual: 0 },
  { id: '2', matricula: 'M2', nome: 'Bruno', apelido: 'Bruno', foto: null, setor: 'Caixa', metaIndividual: 0 },
];

const bioGroups: BioGroupsProducts = {
  G1: [{ nome: 'Suplemento Alfa', palavras: ['suplemento alfa'] }],
  G2: [{ nome: 'Suplemento Beta', palavras: ['suplemento beta'] }],
  G3: [],
  G4: [],
};
const bioWeights: BioWeights = { G1: 1.5, G2: 1.0, G3: 0.5, G4: 0.5 };

const sales: Sale[] = [
  { id: 's1', dataISO: '2026-08-01', matricula: 'M1', vendedor: 'Ana', produto: 'Suplemento Alfa 30cp', qtd: 2, valor: 100, grupo: 'MER' },
  { id: 's2', dataISO: '2026-08-02', matricula: 'M2', vendedor: 'Bruno', produto: 'Suplemento Beta 30cp', qtd: 3, valor: 90, grupo: 'MER' },
  { id: 's3', dataISO: '2026-08-03', matricula: 'M1', vendedor: 'Ana', produto: 'Produto irrelevante', qtd: 5, valor: 50, grupo: 'MER' },
];

describe('computeBioSummary', () => {
  it('only ranks Balcão-sector collaborators', () => {
    const rows = computeBioSummary(sales, collaborators, bioGroups, bioWeights, null, null);
    expect(rows).toHaveLength(1);
    expect(rows[0].matricula).toBe('M1');
  });

  it('computes points as qty * group weight, ignoring non-matching products', () => {
    const rows = computeBioSummary(sales, collaborators, bioGroups, bioWeights, null, null);
    expect(rows[0].qtd.G1).toBe(2);
    expect(rows[0].pontos).toBeCloseTo(2 * 1.5);
    expect(rows[0].itens).toBe(2); // the irrelevant product sale doesn't count
  });
});

describe('auditBioOutsideBalcao', () => {
  it('flags G1-G4 sales made by collaborators outside Balcão', () => {
    const alerts = auditBioOutsideBalcao(sales, collaborators, bioGroups);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].matricula).toBe('M2');
    expect(alerts[0].grupo).toBe('G2');
  });
});

describe('generic category-type support', () => {
  // A hypothetical second category with its own arbitrary group codes (not
  // G1-G4) and its own eligible sector — proves computeBioSummary/
  // auditBioOutsideBalcao/classifyBio are no longer hardcoded to
  // BIOSINTÉTICA's specific shape.
  const otherGroups: BioGroupsProducts = {
    OURO: [{ nome: 'Kit Ouro', palavras: ['kit ouro'] }],
    PRATA: [{ nome: 'Kit Prata', palavras: ['kit prata'] }],
  };
  const otherWeights: BioWeights = { OURO: 3, PRATA: 1 };
  const otherCollaborators: Collaborator[] = [
    { id: '3', matricula: 'M3', nome: 'Carla', apelido: 'Carla', foto: null, setor: 'Caixa', metaIndividual: 0 },
    { id: '4', matricula: 'M4', nome: 'Davi', apelido: 'Davi', foto: null, setor: 'Balcão', metaIndividual: 0 },
  ];
  const otherSales: Sale[] = [
    { id: 'o1', dataISO: '2026-08-01', matricula: 'M3', vendedor: 'Carla', produto: 'Kit Ouro Premium', qtd: 2, valor: 200, grupo: 'MER' },
    { id: 'o2', dataISO: '2026-08-02', matricula: 'M4', vendedor: 'Davi', produto: 'Kit Prata Simples', qtd: 4, valor: 80, grupo: 'MER' },
  ];

  it('computeBioSummary honors an arbitrary group set and a non-Balcão eligible sector', () => {
    const rows = computeBioSummary(otherSales, otherCollaborators, otherGroups, otherWeights, null, null, 'ALL', ['Caixa']);
    expect(rows).toHaveLength(1);
    expect(rows[0].matricula).toBe('M3');
    expect(rows[0].qtd.OURO).toBe(2);
    expect(rows[0].pontos).toBeCloseTo(2 * 3);
  });

  it('auditBioOutsideBalcao flags sales outside the given eligible sector(s), not just Balcão', () => {
    const alerts = auditBioOutsideBalcao(otherSales, otherCollaborators, otherGroups, ['Caixa']);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].matricula).toBe('M4');
    expect(alerts[0].grupo).toBe('PRATA');
  });
});

describe('computeBioUnassigned', () => {
  const orphanSales: Sale[] = [
    ...sales,
    // sem matrícula e com matrícula que não existe na lista de colaboradores
    { id: 's4', dataISO: '2026-08-04', matricula: '', vendedor: '', produto: 'Suplemento Alfa 60cp', qtd: 4, valor: 200, grupo: 'MER' },
    { id: 's5', dataISO: '2026-08-05', matricula: 'X99', vendedor: 'Ex-funcionário', produto: 'Suplemento Beta 30cp', qtd: 2, valor: 60, grupo: 'MER' },
    // produto que não é G1-G4: nunca conta, mesmo sem dono
    { id: 's6', dataISO: '2026-08-05', matricula: '', vendedor: '', produto: 'Produto irrelevante', qtd: 9, valor: 10, grupo: 'MER' },
  ];

  it('soma só as vendas G1-G4 sem dono (sem matrícula ou matrícula desconhecida)', () => {
    const r = computeBioUnassigned(orphanSales, collaborators, bioGroups, bioWeights, null, null);
    expect(r).not.toBeNull();
    expect(r!.itens).toBe(6); // 4 (G1) + 2 (G2)
    expect(r!.pontos).toBeCloseTo(4 * 1.5 + 2 * 1.0);
    expect(r!.qtd.G1).toBe(4);
    expect(r!.qtd.G2).toBe(2);
  });

  it('não conta venda de colaborador cadastrado (essas já estão no ranking)', () => {
    expect(computeBioUnassigned(sales, collaborators, bioGroups, bioWeights, null, null)).toBeNull();
  });

  it('respeita período e filtro de grupo', () => {
    const soG1 = computeBioUnassigned(orphanSales, collaborators, bioGroups, bioWeights, null, null, 'G1');
    expect(soG1!.itens).toBe(4);
    const foraDoPeriodo = computeBioUnassigned(orphanSales, collaborators, bioGroups, bioWeights, '2026-08-05', '2026-08-31');
    expect(foraDoPeriodo!.itens).toBe(2);
  });

  it('casa matrícula com zeros à esquerda (mesma regra do ranking)', () => {
    const cadastrados: Collaborator[] = [{ ...collaborators[0], matricula: '007' }];
    const venda: Sale[] = [{ id: 'z', dataISO: '2026-08-01', matricula: '7', vendedor: 'A', produto: 'Suplemento Alfa', qtd: 1, valor: 1, grupo: 'MER' }];
    expect(computeBioUnassigned(venda, cadastrados, bioGroups, bioWeights, null, null)).toBeNull();
  });
});
