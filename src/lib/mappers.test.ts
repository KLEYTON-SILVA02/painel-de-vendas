import { describe, expect, it } from 'vitest';
import { mapCollaborator, mapSale } from './mappers';
import { computeSummary } from './business/summary';
import type { Tables } from '../types/database';

function sale(overrides: Partial<Tables<'sales'>>): Tables<'sales'> {
  return {
    id: 's1',
    store_id: 'st1',
    matricula: '070209751',
    vendedor: 'ANGELICA CRHYSTINA',
    produto: 'Produto X',
    codigo: null,
    qtd: 1,
    valor: 10,
    grupo: 'MER',
    data_raw: '04/08/2026',
    data_iso: '2026-08-04',
    classification_tier: null,
    created_at: '2026-08-04T00:00:00Z',
    import_id: null,
    ...overrides,
  };
}

function collaborator(overrides: Partial<Tables<'collaborators'>>): Tables<'collaborators'> {
  return {
    id: 'c1',
    store_id: 'st1',
    matricula: '70209751',
    nome: 'ANGELICA CRHYSTINA DE FATIMA M',
    apelido: 'ANGÉLICA',
    foto_url: null,
    foto_conquista_url: null,
    setor: 'Balcão',
    meta_individual: 0,
    data_nascimento: null,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('mapSale / mapCollaborator matrícula normalization', () => {
  // Reproduces the real production bug: the sales sheet stored matrícula
  // as text with a leading zero ("070209751", 9 digits), the colaboradores
  // sheet stored it as a real Excel number ("70209751", 8 digits) — same
  // employee, two different strings, so no sale ever matched its
  // registered collaborator. Every ranking row fell back to a synthesized
  // "unmatched" row instead of the collaborator's registered apelido/foto.
  it('strips the padding difference so a 9-digit sale matrícula matches an 8-digit collaborator matrícula', () => {
    const mappedSale = mapSale(sale({ matricula: '070209751' }));
    const mappedCollaborator = mapCollaborator(collaborator({ matricula: '70209751' }));
    expect(mappedSale.matricula).toBe(mappedCollaborator.matricula);
  });

  it('end-to-end: computeSummary attributes the sale to the registered collaborator, not a synthesized row', () => {
    const sales = [mapSale(sale({ matricula: '070209751', vendedor: '00070209751', valor: 50 }))];
    const collaborators = [mapCollaborator(collaborator({ matricula: '70209751', apelido: 'ANGÉLICA' }))];

    const ranking = computeSummary(sales, collaborators, '2026-08-04', '2026-08-04');
    expect(ranking).toHaveLength(1);
    // The registered apelido wins, even though the sale's own `vendedor`
    // field is garbage (the pre-fix column-mapping bug) — the join now
    // succeeds, so the collaborator's real registered identity is used
    // instead of ever falling back to the sale's own vendedor/matricula.
    expect(ranking[0].apelido).toBe('ANGÉLICA');
    expect(ranking[0].valor).toBe(50);
  });
});
