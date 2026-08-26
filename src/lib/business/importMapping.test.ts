import { describe, expect, it } from 'vitest';
import { autoMapColumns, detectHeaderRow } from './importMapping';

describe('detectHeaderRow', () => {
  it('finds the first row hitting at least 2 known header terms', () => {
    const rows = [
      ['Relatório de vendas'],
      ['Data', 'Matricula', 'Vendedor', 'Produto', 'Qtd', 'Valor'],
      ['01/08/2026', '070003335', 'Ana', 'Produto X', '1', '10,00'],
    ];
    expect(detectHeaderRow(rows)).toBe(1);
  });

  it('defaults to row 0 when nothing matches within the scan window', () => {
    expect(detectHeaderRow([['a', 'b'], ['c', 'd']])).toBe(0);
  });
});

describe('autoMapColumns', () => {
  it('maps by exact header name match', () => {
    const headers = ['Data', 'Matrícula', 'Vendedor', 'Código do Produto', 'Descrição do Produto', 'Quantidade', 'Valor Total'];
    const map = autoMapColumns(headers);
    expect(map).toEqual({ data: 0, matricula: 1, vendedor: 2, codigo: 3, produto: 4, qtd: 5, valor: 6 });
  });

  it('falls back to the fixed column layout when a field is unmatched', () => {
    const headers = ['col1', 'col2', 'col3', 'col4', 'col5', 'col6', 'Matricula'];
    const map = autoMapColumns(headers);
    expect(map.matricula).toBe(6); // matched by name
    expect(map.data).toBe(0); // fixed fallback
    expect(map.vendedor).toBe(7); // fixed fallback (beyond header length, still returned)
  });
});
