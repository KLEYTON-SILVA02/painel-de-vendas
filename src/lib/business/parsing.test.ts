import { describe, expect, it } from 'vitest';
import { dateFromCell, normalizeMatricula, parseDateISO, parseNumeroBR } from './parsing';

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

describe('dateFromCell', () => {
  // Reproduces the real bug: SheetJS formats a `cellDates:true` Excel date
  // cell using the browser's local timezone, so in any UTC-negative zone
  // (e.g. Brazil, UTC-3) the formatted text for an Aug 24 cell comes back
  // as "23/08/2026" — a real Date object at 2026-08-24T02:59:59.999Z, one
  // day off from its UTC calendar date. dateFromCell must ignore that
  // formatted text and read the Date object's own UTC day instead.
  const shiftedDateCell = new Date('2026-08-24T02:59:59.999Z');

  it('derives the ISO date from a raw Date cell via UTC getters, ignoring a timezone-shifted formatted string', () => {
    expect(dateFromCell(shiftedDateCell, '23/08/2026')).toBe('2026-08-24');
  });

  it('falls back to parsing the formatted text for plain-text date cells', () => {
    expect(dateFromCell('24/08/2026', '24/08/2026')).toBe('2026-08-24');
  });

  it('returns null when neither a Date nor a parseable string is given', () => {
    expect(dateFromCell(undefined, '')).toBeNull();
    expect(dateFromCell(new Date('invalid'), '')).toBeNull();
  });
});

describe('normalizeMatricula', () => {
  // Reproduces the real bug: the sales sheet's matrícula column came in as
  // text with a leading zero baked in ("070209751"), while the
  // colaboradores sheet's came in as a real Excel number, already stripped
  // to 8 digits by idFromCell ("70209751") — same employee, two different
  // stored strings, so no sale ever matched its registered collaborator.
  it('strips a leading zero so both sides of the same real matrícula compare equal', () => {
    expect(normalizeMatricula('070209751')).toBe('70209751');
    expect(normalizeMatricula('70209751')).toBe('70209751');
  });

  it('strips multiple leading zeros but keeps at least one digit', () => {
    expect(normalizeMatricula('00000000')).toBe('0');
    expect(normalizeMatricula('007')).toBe('7');
  });

  it('leaves non-numeric matrículas untouched', () => {
    expect(normalizeMatricula('-')).toBe('-');
    expect(normalizeMatricula('ABC123')).toBe('ABC123');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeMatricula('  070004644  ')).toBe('70004644');
  });
});
