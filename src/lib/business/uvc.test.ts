import { describe, expect, it } from 'vitest';
import { computeUvcSummary, fmtUvc } from './uvc';
import type { CategoryTotalRow } from './summary';
import type { ClientServiceRecord, Collaborator } from './types';

function collaborator(over: Partial<Collaborator> = {}): Collaborator {
  return { id: 'c1', matricula: '001', username: null, nome: 'Fulano Silva', apelido: null, foto: null, setor: null, metaIndividual: 0, ...over };
}

describe('computeUvcSummary', () => {
  it('calcula UVC por colaborador (itens ÷ atendimentos) e o total da loja como razão dos totais', () => {
    const collaborators = [collaborator({ id: 'c1', matricula: '001', apelido: 'Fulano' }), collaborator({ id: 'c2', matricula: '002', nome: 'Beltrano Souza' })];
    const categoryTotals: CategoryTotalRow[] = [
      { matricula: '001', categoria: 'DERM', valorTotal: 100, itensTotal: 6 },
      { matricula: '001', categoria: 'GEN', valorTotal: 50, itensTotal: 3 },
      { matricula: '002', categoria: 'DERM', valorTotal: 20, itensTotal: 4 },
    ];
    const records: ClientServiceRecord[] = [
      { id: 'r1', collaboratorId: 'c1', dataISO: '2026-09-01', atendimentos: 3 },
      { id: 'r2', collaboratorId: 'c2', dataISO: '2026-09-01', atendimentos: 2 },
    ];
    const { rows, totals } = computeUvcSummary(categoryTotals, records, collaborators, '2026-09-01', '2026-09-30');
    expect(rows).toEqual([
      { matricula: '001', nome: 'Fulano Silva', apelido: 'Fulano', foto: null, itens: 9, atendimentos: 3, uvc: 3 },
      { matricula: '002', nome: 'Beltrano Souza', apelido: 'Beltrano', foto: null, itens: 4, atendimentos: 2, uvc: 2 },
    ]);
    // Total da loja: 13 itens ÷ 5 atendimentos = 2.6, nunca a soma de 3 + 2.
    expect(totals).toEqual({ itens: 13, atendimentos: 5, uvc: 2.6 });
  });

  it('não calcula UVC (divisão por zero) quando não há atendimentos no período', () => {
    const collaborators = [collaborator()];
    const categoryTotals: CategoryTotalRow[] = [{ matricula: '001', categoria: 'DERM', valorTotal: 10, itensTotal: 5 }];
    const { rows, totals } = computeUvcSummary(categoryTotals, [], collaborators, '2026-09-01', '2026-09-30');
    expect(rows).toEqual([]);
    expect(totals).toEqual({ itens: 5, atendimentos: 0, uvc: null });
  });

  it('respeita o filtro de data dos atendimentos', () => {
    const collaborators = [collaborator()];
    const categoryTotals: CategoryTotalRow[] = [{ matricula: '001', categoria: 'DERM', valorTotal: 10, itensTotal: 5 }];
    const records: ClientServiceRecord[] = [{ id: 'r1', collaboratorId: 'c1', dataISO: '2026-08-31', atendimentos: 9 }];
    const { totals } = computeUvcSummary(categoryTotals, records, collaborators, '2026-09-01', '2026-09-30');
    expect(totals.atendimentos).toBe(0);
  });
});

describe('fmtUvc', () => {
  it('formata com 1 casa decimal, vírgula', () => {
    expect(fmtUvc(3)).toBe('3,0');
    expect(fmtUvc(2.6)).toBe('2,6');
  });

  it('retorna travessão para null', () => {
    expect(fmtUvc(null)).toBe('—');
  });
});
