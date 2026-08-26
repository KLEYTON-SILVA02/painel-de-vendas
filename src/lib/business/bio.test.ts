import { describe, expect, it } from 'vitest';
import { auditBioOutsideBalcao, computeBioSummary } from './bio';
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
