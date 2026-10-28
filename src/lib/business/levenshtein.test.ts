import { describe, expect, it } from 'vitest';
import { levenshteinDistance } from './levenshtein';

describe('levenshteinDistance', () => {
  it('is 0 for identical strings', () => {
    expect(levenshteinDistance('clientes', 'clientes')).toBe(0);
  });

  it('counts a single substitution as 1', () => {
    expect(levenshteinDistance('clientes', 'clisntes')).toBe(1);
  });

  it('counts a letter swap ("CRHYSTINA" vs "CHRYSTINA") as 2', () => {
    expect(levenshteinDistance('crhystina', 'chrystina')).toBe(2);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('counts an insertion/deletion correctly', () => {
    expect(levenshteinDistance('cliente', 'clientes')).toBe(1);
  });
});
