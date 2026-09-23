import { describe, expect, it } from 'vitest';
import { computeDsmSummary } from './dsm';
import type { Collaborator, DsmRecord } from './types';

function collaborator(over: Partial<Collaborator> = {}): Collaborator {
  return { id: 'c1', matricula: '001', username: null, nome: 'Fulano Silva', apelido: null, foto: null, setor: null, metaIndividual: 0, ...over };
}

describe('computeDsmSummary', () => {
  it('sums conversões por colaborador no período', () => {
    const collaborators = [collaborator({ id: 'c1', matricula: '001', apelido: 'Fulano' }), collaborator({ id: 'c2', matricula: '002', nome: 'Beltrano Souza' })];
    const records: DsmRecord[] = [
      { id: 'r1', collaboratorId: 'c1', dataISO: '2026-09-01', quantidade: 3 },
      { id: 'r2', collaboratorId: 'c1', dataISO: '2026-09-02', quantidade: 2 },
      { id: 'r3', collaboratorId: 'c2', dataISO: '2026-09-01', quantidade: 1 },
    ];
    const result = computeDsmSummary(records, collaborators, '2026-09-01', '2026-09-30');
    expect(result).toEqual([
      { matricula: '001', nome: 'Fulano Silva', apelido: 'Fulano', foto: null, conversoes: 5 },
      { matricula: '002', nome: 'Beltrano Souza', apelido: 'Beltrano', foto: null, conversoes: 1 },
    ]);
  });

  it('respeita o filtro de data', () => {
    const collaborators = [collaborator()];
    const records: DsmRecord[] = [
      { id: 'r1', collaboratorId: 'c1', dataISO: '2026-08-31', quantidade: 10 },
      { id: 'r2', collaboratorId: 'c1', dataISO: '2026-09-01', quantidade: 4 },
    ];
    const result = computeDsmSummary(records, collaborators, '2026-09-01', '2026-09-30');
    expect(result).toEqual([{ matricula: '001', nome: 'Fulano Silva', apelido: 'Fulano', foto: null, conversoes: 4 }]);
  });

  it('ignora registro de colaborador que não existe mais', () => {
    const records: DsmRecord[] = [{ id: 'r1', collaboratorId: 'ghost', dataISO: '2026-09-01', quantidade: 1 }];
    expect(computeDsmSummary(records, [], '2026-09-01', '2026-09-30')).toEqual([]);
  });

  it('não inclui colaborador com zero conversões no período', () => {
    const collaborators = [collaborator()];
    const records: DsmRecord[] = [{ id: 'r1', collaboratorId: 'c1', dataISO: '2026-08-01', quantidade: 5 }];
    expect(computeDsmSummary(records, collaborators, '2026-09-01', '2026-09-30')).toEqual([]);
  });
});
