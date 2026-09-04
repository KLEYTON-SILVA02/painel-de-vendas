import { describe, expect, it } from 'vitest';
import { aggregateByDate, compareDateAggregate, saleImportKey, translateDbError } from './salesImport';

const base = { dataISO: '2026-08-04', matricula: '070209751', produto: 'Produto X', codigo: null as string | null, qtd: 1, valor: 10 };

describe('saleImportKey', () => {
  it('produces the same key for the same sale re-parsed from the same or a different upload', () => {
    expect(saleImportKey(base)).toBe(saleImportKey({ ...base }));
  });

  it('is insensitive to matrícula zero-padding and produto case/accents/whitespace — the same real-world matches spreadsheets already treat as equal', () => {
    const variant = { ...base, matricula: '70209751', produto: '  produto x  ' };
    expect(saleImportKey(base)).toBe(saleImportKey(variant));
  });

  it('differs when any business field differs', () => {
    const key = saleImportKey(base);
    expect(saleImportKey({ ...base, dataISO: '2026-08-05' })).not.toBe(key);
    expect(saleImportKey({ ...base, matricula: '070209752' })).not.toBe(key);
    expect(saleImportKey({ ...base, produto: 'Produto Y' })).not.toBe(key);
    expect(saleImportKey({ ...base, codigo: 'C1' })).not.toBe(key);
    expect(saleImportKey({ ...base, qtd: 2 })).not.toBe(key);
    expect(saleImportKey({ ...base, valor: 20 })).not.toBe(key);
  });
});

describe('aggregateByDate', () => {
  it('sums count and value per ISO date, ignoring rows with no date', () => {
    const rows = [
      { dataISO: '2026-08-01', valor: 100 },
      { dataISO: '2026-08-01', valor: 50 },
      { dataISO: '2026-08-02', valor: 30 },
      { dataISO: null, valor: 999 },
    ];
    const agg = aggregateByDate(rows);
    expect(agg.get('2026-08-01')).toEqual({ count: 2, total: 150 });
    expect(agg.get('2026-08-02')).toEqual({ count: 1, total: 30 });
    expect(agg.has(null as unknown as string)).toBe(false);
  });
});

describe('compareDateAggregate', () => {
  it('is "new" when nothing is recorded yet for the date', () => {
    expect(compareDateAggregate({ count: 5, total: 500 }, undefined)).toBe('new');
    expect(compareDateAggregate({ count: 5, total: 500 }, { count: 0, total: 0 })).toBe('new');
  });

  it('is "replace" when the incoming file has at least as many rows and value as what exists', () => {
    expect(compareDateAggregate({ count: 5, total: 500 }, { count: 5, total: 500 })).toBe('replace');
    expect(compareDateAggregate({ count: 6, total: 600 }, { count: 5, total: 500 })).toBe('replace');
  });

  it('tolerates a R$0,01 rounding difference on value', () => {
    expect(compareDateAggregate({ count: 5, total: 499.995 }, { count: 5, total: 500 })).toBe('replace');
  });

  it('is "blocked" when the incoming file has fewer rows or less value than what exists', () => {
    expect(compareDateAggregate({ count: 4, total: 500 }, { count: 5, total: 500 })).toBe('blocked');
    expect(compareDateAggregate({ count: 5, total: 400 }, { count: 5, total: 500 })).toBe('blocked');
  });
});

describe('translateDbError', () => {
  it('translates known Postgres error codes to Portuguese messages', () => {
    expect(translateDbError({ code: '42501', message: 'raw' })).toMatch(/permissão/i);
    expect(translateDbError({ code: '23505', message: 'raw' })).toMatch(/duplicidade/i);
    expect(translateDbError({ code: '23503', message: 'raw' })).toMatch(/referencia/i);
    expect(translateDbError({ code: '23502', message: 'raw' })).toMatch(/obrigatório/i);
    expect(translateDbError({ code: 'PGRST301', message: 'raw' })).toMatch(/sessão expirou/i);
  });

  it('falls back to the original message for unknown errors', () => {
    expect(translateDbError(new Error('algo bem específico'))).toBe('algo bem específico');
  });
});
