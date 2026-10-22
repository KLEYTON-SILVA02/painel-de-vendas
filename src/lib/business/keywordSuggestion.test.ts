import { describe, expect, it } from 'vitest';
import { suggestKeyword } from './keywordSuggestion';

describe('suggestKeyword', () => {
  it('picks the longest distinctive token, ignoring units/packaging/numbers', () => {
    expect(suggestKeyword('HIDRATANTE NIVEA 400ML')).toBe('HIDRATANTE');
    expect(suggestKeyword('KIT SABONETE PROTEX 90G X3')).toBe('SABONETE');
  });

  it('ignores stopwords and short tokens', () => {
    expect(suggestKeyword('CREME DE PENTEAR')).toBe('PENTEAR');
  });

  it('returns null when every token is noise', () => {
    expect(suggestKeyword('KIT 500ML X2')).toBeNull();
  });
});
