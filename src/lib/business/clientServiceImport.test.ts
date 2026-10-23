import { describe, expect, it } from 'vitest';
import { aggregateClientServiceRows, buildClientServiceReviewRows } from './clientServiceImport';
import type { ColumnMap } from './importMapping';

const map: ColumnMap = { data: 0, matricula: 1, vendedor: 2, codigo: -1, produto: -1, qtd: 3, valor: -1 };

describe('aggregateClientServiceRows', () => {
  it('sums the quantity column per matrícula+dia across multiple PDV lines', () => {
    const rows: unknown[][] = [
      ['01/09/2026', '70208345', 'DEIVESON', '2'],
      ['01/09/2026', '70208345', 'DEIVESON', '1'],
      ['02/09/2026', '70208345', 'DEIVESON', '3'],
    ];
    const result = aggregateClientServiceRows(rows, rows, map);
    expect(result).toHaveLength(2);
    const day1 = result.find((r) => r.dataISO === '2026-09-01');
    expect(day1?.atendimentos).toBe(3);
  });

  it('skips rows with no date (subtotal/rodapé) and rows with no matrícula', () => {
    const rows: unknown[][] = [
      ['01/09/2026', '70208345', 'DEIVESON', '2'],
      ['', '70208345', 'DEIVESON', '99'],
      ['01/09/2026', '', 'SEM MATRICULA', '5'],
    ];
    const result = aggregateClientServiceRows(rows, rows, map);
    expect(result).toHaveLength(1);
    expect(result[0].atendimentos).toBe(2);
  });
});

describe('buildClientServiceReviewRows', () => {
  it('resolves a matching colaborador and flags an unregistered matrícula as null', () => {
    const parsed = [
      { matricula: '70208345', vendedorNome: 'DEIVESON', dataISO: '2026-09-01', atendimentos: 12 },
      { matricula: '99999999', vendedorNome: 'FULANO', dataISO: '2026-09-01', atendimentos: 7 },
    ];
    const byMatricula = new Map([['70208345', { id: 'collab-1' }]]);
    const rows = buildClientServiceReviewRows(parsed, byMatricula);
    const row1 = rows.find((r) => r.matricula === '70208345');
    const row2 = rows.find((r) => r.matricula === '99999999');
    expect(row1?.collaboratorId).toBe('collab-1');
    expect(row1?.quantidade).toBe(12);
    expect(row2?.collaboratorId).toBeNull();
  });
});
