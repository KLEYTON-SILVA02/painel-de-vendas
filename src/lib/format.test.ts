import { describe, expect, it } from 'vitest';
import { fmtDateTimeBR } from './format';

describe('fmtDateTimeBR', () => {
  it('mostra dia/mês/ano e hora:minuto com zeros à esquerda', () => {
    expect(fmtDateTimeBR(new Date(2026, 10, 19, 18, 42).toISOString())).toBe('19/11/2026 às 18:42');
    expect(fmtDateTimeBR(new Date(2026, 0, 5, 7, 3).toISOString())).toBe('05/01/2026 às 07:03');
  });
  it('vazio ou inválido devolve texto vazio', () => {
    expect(fmtDateTimeBR(null)).toBe('');
    expect(fmtDateTimeBR(undefined)).toBe('');
    expect(fmtDateTimeBR('não é data')).toBe('');
  });
});
