import { describe, expect, it } from 'vitest';
import {
  classifyBio,
  classifyProduct,
  classifyProductTier,
  EXCLUSIVE_BRANDS_DEFAULT,
  type ClassificationInputs,
} from './classification';

const emptyInputs: ClassificationInputs = {
  catalog: [],
  productsByCategory: { DERM: [], GEN: [], MP: [], MER: [] },
  brandKeywordsByCategory: { DERM: [], GEN: [], MP: [], MER: [] },
  exclusiveBrands: [...EXCLUSIVE_BRANDS_DEFAULT],
};

describe('classifyProductTier', () => {
  it('falls back to MER at tier 5 when nothing matches', () => {
    expect(classifyProductTier('produto totalmente desconhecido xyz', '', emptyInputs)).toEqual({
      categoria: 'MER',
      tier: 5,
    });
  });

  it('tier 1: exact catalog match by code wins over everything else', () => {
    const inputs: ClassificationInputs = {
      ...emptyInputs,
      catalog: [{ nome: 'Produto X', codigo: '123', categoria: 'DERM' }],
      productsByCategory: { ...emptyInputs.productsByCategory, GEN: [{ nome: 'x', palavras: ['produto x'] }] },
    };
    expect(classifyProductTier('Produto X', '123', inputs).categoria).toBe('DERM');
  });

  it('tier 1: exact catalog match by normalized name', () => {
    const inputs: ClassificationInputs = {
      ...emptyInputs,
      catalog: [{ nome: 'Sérum Facial', codigo: null, categoria: 'DERM' }],
    };
    expect(classifyProductTier('serum facial', '', inputs).categoria).toBe('DERM');
  });

  it('tier 2: longest product keyword wins among overlapping matches', () => {
    const inputs: ClassificationInputs = {
      ...emptyInputs,
      productsByCategory: {
        ...emptyInputs.productsByCategory,
        GEN: [{ nome: 'curto', palavras: ['dipirona'] }],
        DERM: [{ nome: 'longo', palavras: ['dipirona sodica gotas'] }],
      },
    };
    const r = classifyProductTier('dipirona sodica gotas 10ml', '', inputs);
    expect(r).toEqual({ categoria: 'DERM', tier: 2 });
  });

  it('tier 3: GEN brand keyword requires a generic marker present in the name', () => {
    // "multilab" isn't in the tier-4 heuristics list, so it isolates tier 3 behavior.
    const inputs: ClassificationInputs = {
      ...emptyInputs,
      brandKeywordsByCategory: { ...emptyInputs.brandKeywordsByCategory, GEN: ['multilab'] },
    };
    expect(classifyProductTier('paracetamol multilab', '', inputs)).toEqual({ categoria: 'MER', tier: 5 });
    expect(classifyProductTier('paracetamol generico multilab', '', inputs)).toEqual({ categoria: 'GEN', tier: 3 });
  });

  it('tier 4: heuristics catch known brand terms', () => {
    expect(classifyProductTier('protetor solar la roche posay fps 60', '', emptyInputs)).toEqual({
      categoria: 'DERM',
      tier: 4,
    });
  });

  it('exclusive brand rule overrides any other tier, recategorizing to MP', () => {
    const inputs: ClassificationInputs = {
      ...emptyInputs,
      catalog: [{ nome: 'Levmel Suplemento', codigo: null, categoria: 'DERM' }],
    };
    expect(classifyProduct('Levmel Suplemento', '', inputs)).toBe('MP');
  });

  it('empty product name yields MER/tier 5 without throwing', () => {
    expect(classifyProductTier('', '', emptyInputs)).toEqual({ categoria: 'MER', tier: 5 });
  });
});

describe('classifyBio', () => {
  const bioGroups = {
    G1: [{ nome: 'colageno premium', palavras: ['colageno premium'] }],
    G2: [{ nome: 'colageno', palavras: ['colageno'] }],
    G3: [],
    G4: [],
  };

  it('returns the longest matching keyword group', () => {
    expect(classifyBio('colageno premium 30 sachês', bioGroups)).toBe('G1');
    expect(classifyBio('colageno hidrolisado simples', bioGroups)).toBe('G2');
  });

  it('returns null when no group matches', () => {
    expect(classifyBio('produto sem relacao nenhuma', bioGroups)).toBeNull();
  });
});
