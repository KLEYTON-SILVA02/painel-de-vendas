import { describe, expect, it } from 'vitest';
import { parseDateISO, parseNumeroBR } from './parsing';

describe('parseNumeroBR', () => {
  it('parses BR-formatted currency', () => {
    expect(parseNumeroBR('R$ 1.234,56')).toBeCloseTo(1234.56);
  });
  it('parses US-formatted numbers', () => {
    expect(parseNumeroBR('1,234.56')).toBeCloseTo(1234.56);
  });
  it('parses plain comma-decimal', () => {
    expect(parseNumeroBR('43,5')).toBeCloseTo(43.5);
  });
  it('treats parentheses as negative', () => {
    expect(parseNumeroBR('(150,00)')).toBeCloseTo(-150);
  });
  it('returns 0 for empty/null/undefined', () => {
    expect(parseNumeroBR('')).toBe(0);
    expect(parseNumeroBR(null)).toBe(0);
    expect(parseNumeroBR(undefined)).toBe(0);
  });
  it('handles plain integers', () => {
    expect(parseNumeroBR('42')).toBe(42);
  });
});

describe('parseDateISO', () => {
  it('parses DD/MM/YYYY', () => {
    expect(parseDateISO('05/03/2026')).toBe('2026-03-05');
  });
  it('parses DD/MM/YY expanding to 20YY', () => {
    expect(parseDateISO('05/03/26')).toBe('2026-03-05');
  });
  it('parses already-ISO dates', () => {
    expect(parseDateISO('2026-3-5')).toBe('2026-03-05');
  });
  it('returns null for unparseable input', () => {
    expect(parseDateISO('not a date')).toBeNull();
    expect(parseDateISO('')).toBeNull();
  });
});
