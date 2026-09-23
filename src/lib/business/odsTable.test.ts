import { describe, expect, it } from 'vitest';
import { parseOdsTable } from './odsTable';

// Fixture reproduces the exact merge/repeat pattern found in the real DSM
// planilha this reader was built for (see file comment in odsTable.ts):
// a header row (2 separate covered cells for the 3-col matrícula merge),
// a colaborador's first day-row (1 covered cell with number-columns-
// repeated="2" for that same merge — the pattern SheetJS mishandles), a
// later day-row where the Loja + matrícula covered columns collapse into a
// single number-columns-repeated="4" cell, and that colaborador's subtotal
// row (an empty but present Data cell, not an absent one).
const FIXTURE_XML = `<?xml version="1.0"?>
<office:document-content xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
<table:table table:name="Planilha1">
<table:table-row>
  <table:table-cell office:value-type="string"><text:p>Loja</text:p></table:table-cell>
  <table:table-cell table:number-columns-spanned="3" table:number-rows-spanned="1" office:value-type="string"><text:p>Matrícula - Nome funcionário</text:p></table:table-cell>
  <table:covered-table-cell/>
  <table:covered-table-cell/>
  <table:table-cell office:value-type="string"><text:p>Data</text:p></table:table-cell>
  <table:table-cell office:value-type="string"><text:p>Número de Vendas</text:p></table:table-cell>
  <table:table-cell office:value-type="string"><text:p>Valor das Vendas (R$)</text:p></table:table-cell>
  <table:table-cell table:number-columns-spanned="2" table:number-rows-spanned="1" office:value-type="string"><text:p>Número de Clientes</text:p></table:table-cell>
  <table:covered-table-cell/>
  <table:table-cell office:value-type="string"><text:p>Número de Clientes(%)</text:p></table:table-cell>
</table:table-row>
<table:table-row>
  <table:table-cell table:number-columns-spanned="1" table:number-rows-spanned="3" office:value-type="float"><text:p>7152</text:p></table:table-cell>
  <table:table-cell table:number-columns-spanned="3" table:number-rows-spanned="2" office:value-type="string"><text:p>70208345-DEIVESON RAMOS PAIVA</text:p></table:table-cell>
  <table:covered-table-cell table:number-columns-repeated="2"/>
  <table:table-cell office:value-type="date"><text:p>01/09/2026</text:p></table:table-cell>
  <table:table-cell office:value-type="float"><text:p>111</text:p></table:table-cell>
  <table:table-cell office:value-type="float"><text:p>4.131,79</text:p></table:table-cell>
  <table:table-cell table:number-columns-spanned="2" table:number-rows-spanned="1" office:value-type="float"><text:p>1</text:p></table:table-cell>
  <table:covered-table-cell/>
  <table:table-cell office:value-type="percentage"><text:p>0,90%</text:p></table:table-cell>
</table:table-row>
<table:table-row>
  <table:covered-table-cell table:number-columns-repeated="4"/>
  <table:table-cell office:value-type="date"><text:p>02/09/2026</text:p></table:table-cell>
  <table:table-cell office:value-type="float"><text:p>99</text:p></table:table-cell>
  <table:table-cell office:value-type="float"><text:p>3.537,47</text:p></table:table-cell>
  <table:table-cell table:number-columns-spanned="2" table:number-rows-spanned="1" office:value-type="float"><text:p>5</text:p></table:table-cell>
  <table:covered-table-cell/>
  <table:table-cell office:value-type="percentage"><text:p>5,05%</text:p></table:table-cell>
</table:table-row>
<table:table-row>
  <table:covered-table-cell/>
  <table:covered-table-cell/>
  <table:covered-table-cell table:number-columns-repeated="2"/>
  <table:table-cell/>
  <table:table-cell office:value-type="float"><text:p>210</text:p></table:table-cell>
  <table:table-cell office:value-type="float"><text:p>7.669,26</text:p></table:table-cell>
  <table:table-cell table:number-columns-spanned="2" table:number-rows-spanned="1" office:value-type="float"><text:p>6</text:p></table:table-cell>
  <table:covered-table-cell/>
  <table:table-cell office:value-type="percentage"><text:p>2,86%</text:p></table:table-cell>
</table:table-row>
</table:table>
</office:document-content>`;

describe('parseOdsTable', () => {
  const { rows, merges } = parseOdsTable(FIXTURE_XML);

  it('keeps every row column-aligned with the header, regardless of how covered cells are grouped', () => {
    expect(rows[0][4]).toBe('Data');
    // First day-row: covered continuation written as one repeated cell.
    expect(rows[1][4]).toBe('01/09/2026');
    expect(rows[1][5]).toBe('111');
    // Second day-row: Loja + matrícula covered columns collapsed into one
    // number-columns-repeated="4" cell — the exact pattern SheetJS mishandles.
    expect(rows[2][4]).toBe('02/09/2026');
    expect(rows[2][5]).toBe('99');
    // Subtotal row: Data is an empty-but-present cell, not absent.
    expect(rows[3][4]).toBe('');
    expect(rows[3][5]).toBe('210');
  });

  it('reads the "Número de Clientes" values at the header-aligned column', () => {
    expect(rows[1][7]).toBe('1');
    expect(rows[2][7]).toBe('5');
    expect(rows[3][7]).toBe('6');
  });

  it('computes merges usable to fill the matrícula column down every day-row', () => {
    const matriculaMerge = merges.find((m) => m.s.r === 1 && m.s.c === 1);
    expect(matriculaMerge).toEqual({ s: { r: 1, c: 1 }, e: { r: 2, c: 3 } });
  });
});
