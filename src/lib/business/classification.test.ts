import { describe, expect, it } from 'vitest';
import {
  classifyBio,
  classifyProduct,
  classifyProductTier,
  EXCLUSIVE_BRANDS_DEFAULT,
  normalizeGrupoImport,
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

  it('tier 2: a keyword that is just the category code itself (bulk-import data-entry mistake) is ignored, falling back to the product name', () => {
    // Real incident: every GEN/MP product in a live store had palavras
    // === [categoria] (e.g. ['GEN']) instead of a real keyword, from a
    // bulk-import column mix-up. Left unfixed, "gen" (3 chars, meets the
    // tier-2 threshold) would match almost any product name containing it
    // ("colageno", "oxigenio"...), and the actual GEN products would never
    // match on their own name at all since palavras took priority over nome.
    const inputs: ClassificationInputs = {
      ...emptyInputs,
      productsByCategory: {
        ...emptyInputs.productsByCategory,
        GEN: [{ nome: 'aciclovir 400mg cpd/30 gn-ems', palavras: ['GEN'] }],
      },
    };
    // An unrelated product that merely contains "gen" must NOT be pulled into GEN.
    expect(classifyProductTier('colageno hidrolisado 300g', '', inputs)).toEqual({ categoria: 'MER', tier: 5 });
    // The actual registered product still matches — by its own name, once
    // the junk keyword is discarded.
    expect(classifyProductTier('ACICLOVIR 400MG CPD/30 GN-EMS', '', inputs)).toEqual({ categoria: 'GEN', tier: 2 });
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

  it('empty product name always yields null, regardless of useFallback', () => {
    expect(classifyProductTier('', '', emptyInputs)).toEqual({ categoria: null, tier: 5 });
    expect(classifyProductTier('', '', emptyInputs, false)).toEqual({ categoria: null, tier: 5 });
  });

  it('useFallback=false leaves an unmatched product unclassified instead of defaulting to MER', () => {
    expect(classifyProductTier('produto totalmente desconhecido xyz', '', emptyInputs, false)).toEqual({
      categoria: null,
      tier: 5,
    });
  });

  it('useFallback=false still applies the exclusive-brand override', () => {
    expect(classifyProductTier('Levmel Suplemento', '', emptyInputs, false).categoria).toBe('MP');
  });

  it('useFallback=false does not affect a product that matched tiers 1-4', () => {
    const inputs: ClassificationInputs = {
      ...emptyInputs,
      catalog: [{ nome: 'Produto X', codigo: null, categoria: 'DERM' }],
    };
    expect(classifyProductTier('Produto X', '', inputs, false)).toEqual({ categoria: 'DERM', tier: 1 });
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

  it('a keyword that is just the group code itself (bulk-import mistake) is ignored, falling back to the product name', () => {
    // Real incident: most Biosintética products in a live store had
    // palavras === ['G1']/['G2']/... instead of a real keyword. Left
    // unfixed, any sale whose product name happened to contain "g1"
    // anywhere (compressed SKU codes like "MG120ML" or "AG32X7") got
    // pulled into the Biosintética ranking, none of which are actually
    // Biosintética products.
    const groups = {
      G1: [{ nome: 'AQUARELA 10MG CPD/30', palavras: ['G1'] }],
      G2: [],
      G3: [],
      G4: [],
    };
    expect(classifyBio('SERINGA SOL CARE LUER 3ML C/ AG30X7', groups)).toBeNull();
    expect(classifyBio('FOSF SOD PREDNISOLONA3MG120MLGN-BIO', groups)).toBeNull();
    expect(classifyBio('AQUARELA 10MG CPD/30', groups)).toBe('G1');
  });
});

describe('normalizeGrupoImport', () => {
  it('matches the human-readable "Grupo N" labels the UI itself uses', () => {
    expect(normalizeGrupoImport('Grupo 1')).toBe('G1');
    expect(normalizeGrupoImport('Grupo 2')).toBe('G2');
    expect(normalizeGrupoImport('Grupo 3')).toBe('G3');
    expect(normalizeGrupoImport('Grupo 4')).toBe('G4');
  });

  it('matches "G1"-style and bare-number cells', () => {
    expect(normalizeGrupoImport('G1')).toBe('G1');
    expect(normalizeGrupoImport('g-4')).toBe('G4');
    expect(normalizeGrupoImport('  3  ')).toBe('G3');
    expect(normalizeGrupoImport('Categoria: 2')).toBe('G2');
  });

  it('returns null for empty or unrecognized cells', () => {
    expect(normalizeGrupoImport('')).toBeNull();
    expect(normalizeGrupoImport('mercadoria geral')).toBeNull();
  });
});
