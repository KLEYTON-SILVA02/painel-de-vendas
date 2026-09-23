import { describe, expect, it } from 'vitest';
import {
  buildDsmReviewRows,
  detectDsmHeaderRow,
  fillMergedCells,
  mapDsmColumns,
  parseDsmRows,
  splitMatriculaNome,
} from './dsmImport';

describe('splitMatriculaNome', () => {
  it('splits matrícula and nome on the dash', () => {
    expect(splitMatriculaNome('70208345-DEIVESON RAMOS PAIVA')).toEqual({ matricula: '70208345', nome: 'DEIVESON RAMOS PAIVA' });
  });

  it('strips leading zeros from the matrícula', () => {
    expect(splitMatriculaNome('070208345-FULANO')).toEqual({ matricula: '70208345', nome: 'FULANO' });
  });

  it('returns an empty matrícula for text with no leading number (e.g. NÃO IDENTIFICADO)', () => {
    expect(splitMatriculaNome('NÃO IDENTIFICADO')).toEqual({ matricula: '', nome: 'NÃO IDENTIFICADO' });
  });
});

describe('detectDsmHeaderRow / mapDsmColumns', () => {
  const headers = ['Loja', 'Matrícula -\nNome funcionário', '', '', 'Data', 'Número de\nVendas', 'Valor das Vendas (R$)', 'Número de\nClientes', '', 'Número de Clientes(%)'];
  const rows = [['x'], headers, ['7152']];

  it('finds the header row', () => {
    expect(detectDsmHeaderRow(rows)).toBe(1);
  });

  it('maps matrícula, data and quantidade columns by header text', () => {
    expect(mapDsmColumns(headers)).toEqual({ matriculaNome: 1, data: 4, quantidade: 7 });
  });
});

describe('fillMergedCells', () => {
  it('fills a vertical+horizontal merge down from its top-left value, without overwriting real data', () => {
    const rows: unknown[][] = [
      ['7152', '70208345-DEIVESON', '', '', '01/09/2026', '111', '4.131,79', '1'],
      ['', '', '', '', '02/09/2026', '99', '3.537,47', '5'],
      ['', '', '', '', '04/09/2026', '94', '3.342,15', '3'],
    ];
    fillMergedCells(rows, [
      { s: { r: 0, c: 0 }, e: { r: 2, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 2, c: 3 } },
    ]);
    expect(rows[1][1]).toBe('70208345-DEIVESON');
    expect(rows[2][1]).toBe('70208345-DEIVESON');
    expect(rows[1][4]).toBe('02/09/2026');
    expect(rows[2][6]).toBe('3.342,15');
  });
});

describe('parseDsmRows', () => {
  const map = { matriculaNome: 1, data: 4, quantidade: 7 };

  it('skips rows with no date (subtotal / grand-total lines)', () => {
    const rows: unknown[][] = [
      ['7152', '70208345-DEIVESON', '', '', '01/09/2026', '111', '4.131,79', '1'],
      ['7152', '70208345-DEIVESON', '', '', '', '210', '7.669,26', '6'],
    ];
    const rawRows = rows;
    const parsed = parseDsmRows(rows, rawRows, map);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ matricula: '70208345', dataISO: '2026-09-01', quantidade: 1 });
  });

  it('parses a NÃO IDENTIFICADO row with an empty matrícula', () => {
    const rows: unknown[][] = [['7152', 'NÃO IDENTIFICADO', '', '', '01/09/2026', '55', '1.367,88', '0']];
    const parsed = parseDsmRows(rows, rows, map);
    expect(parsed[0].matricula).toBe('');
  });
});

describe('buildDsmReviewRows', () => {
  it('resolves a matching colaborador and flags an unregistered matrícula as null', () => {
    const parsed = [
      { matriculaRaw: '70208345-DEIVESON', matricula: '70208345', nomePlanilha: 'DEIVESON', dataISO: '2026-09-01', dataRaw: '01/09/2026', quantidade: 1 },
      { matriculaRaw: '99999999-FULANO', matricula: '99999999', nomePlanilha: 'FULANO', dataISO: '2026-09-01', dataRaw: '01/09/2026', quantidade: 2 },
    ];
    const byMatricula = new Map([['70208345', { id: 'collab-1' }]]);
    const rows = buildDsmReviewRows(parsed, byMatricula);
    expect(rows[0].collaboratorId).toBe('collab-1');
    expect(rows[1].collaboratorId).toBeNull();
  });
});
