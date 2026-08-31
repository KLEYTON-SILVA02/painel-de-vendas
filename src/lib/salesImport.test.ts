import { describe, expect, it } from 'vitest';
import { saleImportKey } from './salesImport';

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
