import { describe, expect, it } from 'vitest';
import { computeUvcSummary, fmtUvc, type DailyValorRow } from './uvc';
import { fmtMoney } from '../format';
import type { ClientServiceRecord, Collaborator } from './types';

function collaborator(over: Partial<Collaborator> = {}): Collaborator {
  return { id: 'c1', matricula: '001', username: null, nome: 'Fulano Silva', apelido: null, foto: null, setor: null, metaIndividual: 0, ...over };
}

describe('computeUvcSummary — fora do Modo Geral (razão dos totais do período)', () => {
  it('calcula UVC em R$ por colaborador (valor ÷ atendimentos) e o total da loja como razão dos totais', () => {
    const collaborators = [collaborator({ id: 'c1', matricula: '001', apelido: 'Fulano' }), collaborator({ id: 'c2', matricula: '002', nome: 'Beltrano Souza' })];
    const dailyValor: DailyValorRow[] = [
      { matricula: '001', dataISO: '2026-09-01', valorTotal: 60 },
      { matricula: '001', dataISO: '2026-09-02', valorTotal: 30 },
      { matricula: '002', dataISO: '2026-09-01', valorTotal: 20 },
    ];
    const records: ClientServiceRecord[] = [
      { id: 'r1', collaboratorId: 'c1', dataISO: '2026-09-01', atendimentos: 3 },
      { id: 'r2', collaboratorId: 'c1', dataISO: '2026-09-02', atendimentos: 3 },
      { id: 'r3', collaboratorId: 'c2', dataISO: '2026-09-01', atendimentos: 2 },
    ];
    const { rows, totals } = computeUvcSummary(dailyValor, records, collaborators, '2026-09-01', '2026-09-30', false);
    expect(rows).toEqual([
      { matricula: '001', nome: 'Fulano Silva', apelido: 'Fulano', foto: null, valor: 90, atendimentos: 6, uvc: 15 },
      { matricula: '002', nome: 'Beltrano Souza', apelido: 'Beltrano', foto: null, valor: 20, atendimentos: 2, uvc: 10 },
    ]);
    // Total da loja: R$ 110 ÷ 8 atendimentos = 13,75, nunca a soma/média de 15 + 10.
    expect(totals).toEqual({ valor: 110, atendimentos: 8, uvc: 13.75 });
  });

  it('não calcula UVC (divisão por zero) quando não há atendimentos no período', () => {
    const collaborators = [collaborator()];
    const dailyValor: DailyValorRow[] = [{ matricula: '001', dataISO: '2026-09-01', valorTotal: 50 }];
    const { rows, totals } = computeUvcSummary(dailyValor, [], collaborators, '2026-09-01', '2026-09-30', false);
    expect(rows).toEqual([]);
    expect(totals).toEqual({ valor: 50, atendimentos: 0, uvc: null });
  });

  it('respeita o filtro de data dos atendimentos e do valor', () => {
    const collaborators = [collaborator()];
    const dailyValor: DailyValorRow[] = [{ matricula: '001', dataISO: '2026-08-31', valorTotal: 999 }];
    const records: ClientServiceRecord[] = [{ id: 'r1', collaboratorId: 'c1', dataISO: '2026-08-31', atendimentos: 9 }];
    const { totals } = computeUvcSummary(dailyValor, records, collaborators, '2026-09-01', '2026-09-30', false);
    expect(totals).toEqual({ valor: 0, atendimentos: 0, uvc: null });
  });
});

describe('computeUvcSummary — Modo Geral (média das razões diárias)', () => {
  it('usa a média do UVC diário, não a razão do total do mês, quando atendimentos só foi importado em alguns dias', () => {
    const collaborators = [collaborator({ id: 'c1', matricula: '001' })];
    // Valor vendido TODO o mês (30 dias), mas atendimentos só em 2 dias —
    // a razão do total do mês ficaria artificialmente alta (900 ÷ 6 = 150).
    const dailyValor: DailyValorRow[] = Array.from({ length: 30 }, (_, i) => ({
      matricula: '001',
      dataISO: `2026-09-${String(i + 1).padStart(2, '0')}`,
      valorTotal: 30,
    }));
    const records: ClientServiceRecord[] = [
      { id: 'r1', collaboratorId: 'c1', dataISO: '2026-09-01', atendimentos: 3 }, // razão do dia: 30/3 = 10
      { id: 'r2', collaboratorId: 'c1', dataISO: '2026-09-02', atendimentos: 6 }, // razão do dia: 30/6 = 5
    ];
    const { rows, totals } = computeUvcSummary(dailyValor, records, collaborators, '2026-09-01', '2026-09-30', true);
    // Média das razões diárias: (10 + 5) / 2 = 7,5 — nunca 900/9=100 nem 60/9.
    expect(rows).toEqual([{ matricula: '001', nome: 'Fulano Silva', apelido: 'Fulano', foto: null, valor: 60, atendimentos: 9, uvc: 7.5 }]);
    expect(totals).toEqual({ valor: 900, atendimentos: 9, uvc: 7.5 });
  });

  it('totais da loja no Modo Geral são a média das razões diárias DA LOJA, nunca a média das razões por colaborador', () => {
    const collaborators = [collaborator({ id: 'c1', matricula: '001' }), collaborator({ id: 'c2', matricula: '002', nome: 'Beltrano Souza' })];
    const dailyValor: DailyValorRow[] = [
      { matricula: '001', dataISO: '2026-09-01', valorTotal: 10 },
      { matricula: '002', dataISO: '2026-09-01', valorTotal: 10 },
    ];
    const records: ClientServiceRecord[] = [
      { id: 'r1', collaboratorId: 'c1', dataISO: '2026-09-01', atendimentos: 1 }, // razão individual: 10
      { id: 'r2', collaboratorId: 'c2', dataISO: '2026-09-01', atendimentos: 9 }, // razão individual: 1,11
    ];
    const { totals } = computeUvcSummary(dailyValor, records, collaborators, '2026-09-01', '2026-09-30', true);
    // Razão da loja no dia: (10+10) ÷ (1+9) = 2 — bem diferente da média
    // das razões individuais ((10 + 1,11) / 2 ≈ 5,56), que seria o erro.
    expect(totals.uvc).toBe(2);
  });

  it('não calcula UVC (divisão por zero) quando não há nenhum dia com atendimentos no Modo Geral', () => {
    const collaborators = [collaborator()];
    const dailyValor: DailyValorRow[] = [{ matricula: '001', dataISO: '2026-09-01', valorTotal: 50 }];
    const { rows, totals } = computeUvcSummary(dailyValor, [], collaborators, '2026-09-01', '2026-09-30', true);
    expect(rows).toEqual([]);
    expect(totals).toEqual({ valor: 50, atendimentos: 0, uvc: null });
  });
});

describe('fmtUvc', () => {
  it('formata como moeda BRL', () => {
    expect(fmtUvc(3)).toBe(fmtMoney(3));
    expect(fmtUvc(2.6)).toBe(fmtMoney(2.6));
    expect(fmtUvc(13.75)).toBe(fmtMoney(13.75));
  });

  it('retorna travessão para null', () => {
    expect(fmtUvc(null)).toBe('—');
  });
});
