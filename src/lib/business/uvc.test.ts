import { describe, expect, it } from 'vitest';
import { computeUvcDailyRows, computeUvcSummary, fmtUvc, type DailyItensRow } from './uvc';
import type { ClientServiceRecord, Collaborator } from './types';

function collaborator(over: Partial<Collaborator> = {}): Collaborator {
  return { id: 'c1', matricula: '001', username: null, nome: 'Fulano Silva', apelido: null, foto: null, setor: null, metaIndividual: 0, ...over };
}

describe('computeUvcSummary — fora do Modo Geral (razão dos totais do período)', () => {
  it('calcula UVC por colaborador (itens ÷ atendimentos) e o total da loja como razão dos totais', () => {
    const collaborators = [collaborator({ id: 'c1', matricula: '001', apelido: 'Fulano' }), collaborator({ id: 'c2', matricula: '002', nome: 'Beltrano Souza' })];
    const dailyItens: DailyItensRow[] = [
      { matricula: '001', dataISO: '2026-09-01', itensTotal: 6 },
      { matricula: '001', dataISO: '2026-09-02', itensTotal: 3 },
      { matricula: '002', dataISO: '2026-09-01', itensTotal: 4 },
    ];
    const records: ClientServiceRecord[] = [
      { id: 'r1', collaboratorId: 'c1', dataISO: '2026-09-01', atendimentos: 2 },
      { id: 'r2', collaboratorId: 'c1', dataISO: '2026-09-02', atendimentos: 1 },
      { id: 'r3', collaboratorId: 'c2', dataISO: '2026-09-01', atendimentos: 2 },
    ];
    const { rows, totals } = computeUvcSummary(dailyItens, records, collaborators, '2026-09-01', '2026-09-30', false);
    expect(rows).toEqual([
      { matricula: '001', nome: 'Fulano Silva', apelido: 'Fulano', foto: null, itens: 9, atendimentos: 3, uvc: 3 },
      { matricula: '002', nome: 'Beltrano Souza', apelido: 'Beltrano', foto: null, itens: 4, atendimentos: 2, uvc: 2 },
    ]);
    // Total da loja: 13 itens ÷ 5 atendimentos = 2.6, nunca a soma de 3 + 2.
    expect(totals).toEqual({ itens: 13, atendimentos: 5, uvc: 2.6 });
  });

  it('não calcula UVC (divisão por zero) quando não há atendimentos no período', () => {
    const collaborators = [collaborator()];
    const dailyItens: DailyItensRow[] = [{ matricula: '001', dataISO: '2026-09-01', itensTotal: 5 }];
    const { rows, totals } = computeUvcSummary(dailyItens, [], collaborators, '2026-09-01', '2026-09-30', false);
    expect(rows).toEqual([]);
    expect(totals).toEqual({ itens: 5, atendimentos: 0, uvc: null });
  });

  it('respeita o filtro de data dos atendimentos e dos itens', () => {
    const collaborators = [collaborator()];
    const dailyItens: DailyItensRow[] = [{ matricula: '001', dataISO: '2026-08-31', itensTotal: 99 }];
    const records: ClientServiceRecord[] = [{ id: 'r1', collaboratorId: 'c1', dataISO: '2026-08-31', atendimentos: 9 }];
    const { totals } = computeUvcSummary(dailyItens, records, collaborators, '2026-09-01', '2026-09-30', false);
    expect(totals).toEqual({ itens: 0, atendimentos: 0, uvc: null });
  });
});

describe('computeUvcSummary — Modo Geral (média das razões diárias)', () => {
  it('usa a média do UVC diário, não a razão do total do mês, quando atendimentos só foi importado em alguns dias', () => {
    const collaborators = [collaborator({ id: 'c1', matricula: '001' })];
    // Itens vendidos TODO o mês (30 dias), mas atendimentos só em 2 dias —
    // a razão do total do mês ficaria artificialmente alta (90 ÷ 9 = 10).
    const dailyItens: DailyItensRow[] = Array.from({ length: 30 }, (_, i) => ({
      matricula: '001',
      dataISO: `2026-09-${String(i + 1).padStart(2, '0')}`,
      itensTotal: 3,
    }));
    const records: ClientServiceRecord[] = [
      { id: 'r1', collaboratorId: 'c1', dataISO: '2026-09-01', atendimentos: 1 }, // razão do dia: 3/1 = 3
      { id: 'r2', collaboratorId: 'c1', dataISO: '2026-09-02', atendimentos: 3 }, // razão do dia: 3/3 = 1
    ];
    const { rows, totals } = computeUvcSummary(dailyItens, records, collaborators, '2026-09-01', '2026-09-30', true);
    // Média das razões diárias: (3 + 1) / 2 = 2 — nunca 90/9=10 nem 6/9.
    expect(rows).toEqual([{ matricula: '001', nome: 'Fulano Silva', apelido: 'Fulano', foto: null, itens: 6, atendimentos: 4, uvc: 2 }]);
    expect(totals).toEqual({ itens: 90, atendimentos: 4, uvc: 2 });
  });

  it('totais da loja no Modo Geral são a média das razões diárias DA LOJA, nunca a média das razões por colaborador', () => {
    const collaborators = [collaborator({ id: 'c1', matricula: '001' }), collaborator({ id: 'c2', matricula: '002', nome: 'Beltrano Souza' })];
    const dailyItens: DailyItensRow[] = [
      { matricula: '001', dataISO: '2026-09-01', itensTotal: 10 },
      { matricula: '002', dataISO: '2026-09-01', itensTotal: 10 },
    ];
    const records: ClientServiceRecord[] = [
      { id: 'r1', collaboratorId: 'c1', dataISO: '2026-09-01', atendimentos: 1 }, // razão individual: 10
      { id: 'r2', collaboratorId: 'c2', dataISO: '2026-09-01', atendimentos: 9 }, // razão individual: 1,11
    ];
    const { totals } = computeUvcSummary(dailyItens, records, collaborators, '2026-09-01', '2026-09-30', true);
    // Razão da loja no dia: (10+10) ÷ (1+9) = 2 — bem diferente da média
    // das razões individuais ((10 + 1,11) / 2 ≈ 5,56), que seria o erro.
    expect(totals.uvc).toBe(2);
  });

  it('não calcula UVC (divisão por zero) quando não há nenhum dia com atendimentos no Modo Geral', () => {
    const collaborators = [collaborator()];
    const dailyItens: DailyItensRow[] = [{ matricula: '001', dataISO: '2026-09-01', itensTotal: 5 }];
    const { rows, totals } = computeUvcSummary(dailyItens, [], collaborators, '2026-09-01', '2026-09-30', true);
    expect(rows).toEqual([]);
    expect(totals).toEqual({ itens: 5, atendimentos: 0, uvc: null });
  });
});

describe('computeUvcDailyRows', () => {
  it('monta um total da loja por dia, mais recente primeiro, com a razão do próprio dia', () => {
    const collaborators = [collaborator({ id: 'c1', matricula: '001' }), collaborator({ id: 'c2', matricula: '002', nome: 'Beltrano Souza' })];
    const dailyItens: DailyItensRow[] = [
      { matricula: '001', dataISO: '2026-09-01', itensTotal: 6 },
      { matricula: '002', dataISO: '2026-09-01', itensTotal: 4 },
      { matricula: '001', dataISO: '2026-09-02', itensTotal: 9 },
    ];
    const records: ClientServiceRecord[] = [
      { id: 'r1', collaboratorId: 'c1', dataISO: '2026-09-01', atendimentos: 2 },
      { id: 'r2', collaboratorId: 'c2', dataISO: '2026-09-01', atendimentos: 3 },
      // 02/09 sem nenhum atendimento importado — uvc null, nunca 0 nem erro.
    ];
    const rows = computeUvcDailyRows(dailyItens, records, collaborators, '2026-09-01', '2026-09-30');
    expect(rows).toEqual([
      { dataISO: '2026-09-02', itens: 9, atendimentos: 0, uvc: null },
      { dataISO: '2026-09-01', itens: 10, atendimentos: 5, uvc: 2 },
    ]);
  });

  it('respeita o filtro de período', () => {
    const collaborators = [collaborator()];
    const dailyItens: DailyItensRow[] = [{ matricula: '001', dataISO: '2026-08-31', itensTotal: 50 }];
    const rows = computeUvcDailyRows(dailyItens, [], collaborators, '2026-09-01', '2026-09-30');
    expect(rows).toEqual([]);
  });
});

describe('fmtUvc', () => {
  it('formata com 1 casa decimal, vírgula, e prefixo "R$" só visual (UVC continua sendo itens ÷ atendimentos, não dinheiro)', () => {
    expect(fmtUvc(3)).toBe('R$ 3,0');
    expect(fmtUvc(2.6)).toBe('R$ 2,6');
  });

  it('retorna travessão para null', () => {
    expect(fmtUvc(null)).toBe('—');
  });
});
