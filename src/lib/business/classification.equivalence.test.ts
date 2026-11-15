import { describe, expect, it } from 'vitest';
import {
  CAT_KEYS,
  EXCLUSIVE_BRANDS_DEFAULT,
  GENERIC_MARKERS,
  HEURISTICS,
  classifyProductTier,
  keywordsOf,
  type CategoryKey,
  type ClassificationInputs,
  type ClassificationResult,
} from './classification';
import { normalize } from './normalize';

// Cópia fiel da versão ANTERIOR de classifyProductTier (varredura completa, normalizando
// tudo a cada chamada). Serve de gabarito: a versão rápida tem de dar o MESMO resultado.
function referenceClassify(
  nome: string,
  codigo: string | null | undefined,
  inputs: ClassificationInputs,
  /** When false, a product that matches nothing (tiers 1-4) stays
   * unclassified (categoria: null) instead of defaulting to MER — used by
   * the Auditoria "pendentes" screen to find products with no specific rule
   * at all, as opposed to ones legitimately classified as MER by a rule. */
  useFallback = true,
): ClassificationResult {
  const n = normalize(nome);
  if (!n) return { categoria: null, tier: 5 };

  let result: CategoryKey | null = null;
  let tier: 1 | 2 | 3 | 4 | 5 = 5;

  // Tier 1 — exact catalog match by code or name (highest priority)
  const codN = (codigo || '').toString().trim();
  const cat = inputs.catalog.find(
    (c) => (codN && c.codigo && c.codigo.toString().trim() === codN) || (c.nome && normalize(c.nome) === n),
  );
  if (cat) {
    result = cat.categoria;
    tier = 1;
  }

  // Tier 2 — per-product keywords across all categories (longest match wins)
  if (!result) {
    const matches: { k: CategoryKey; len: number }[] = [];
    CAT_KEYS.forEach((k) => {
      (inputs.productsByCategory[k] || []).forEach((p) => {
        keywordsOf(p, k).forEach((kw) => {
          const pad = normalize(kw);
          if (pad && pad.length >= 3 && n.includes(pad)) matches.push({ k, len: pad.length });
        });
      });
    });
    if (matches.length) {
      matches.sort((a, b) => b.len - a.len);
      result = matches[0].k;
      tier = 2;
    }
  }

  // Tier 3 — brand keywords per category (GEN requires a generic marker too)
  if (!result) {
    const kwMatches: { k: CategoryKey; len: number }[] = [];
    CAT_KEYS.forEach((k) => {
      (inputs.brandKeywordsByCategory[k] || []).forEach((kw) => {
        const kwn = normalize(kw);
        if (!kwn || !n.includes(kwn)) return;
        if (k === 'GEN') {
          const hasMarker = GENERIC_MARKERS.some((m) => n.includes(m.trim()));
          if (!hasMarker) return;
        }
        kwMatches.push({ k, len: kwn.length });
      });
    });
    if (kwMatches.length) {
      kwMatches.sort((a, b) => b.len - a.len);
      result = kwMatches[0].k;
      tier = 3;
    }
  }

  // Tier 4 — internal heuristics (known-term fallback)
  if (!result) {
    for (const k of ['MP', 'DERM', 'GEN', 'MER'] as CategoryKey[]) {
      if (HEURISTICS[k].some((h) => n.includes(h))) {
        result = k;
        tier = 4;
        break;
      }
    }
  }

  // Tier 5 — nothing matched: Mercadoria Geral is the universal fallback,
  // unless the caller explicitly wants to know about the "no rule at all" case.
  if (!result && useFallback) {
    result = 'MER';
    tier = 5;
  }

  // Exclusive-brand rule: always recategorizes to MP, even over a match found
  // above — and even over an unclassified (useFallback=false) result.
  const brands = inputs.exclusiveBrands.length ? inputs.exclusiveBrands : EXCLUSIVE_BRANDS_DEFAULT;
  if (brands.some((b) => n.includes(normalize(b)))) {
    result = 'MP';
  }

  return { categoria: result, tier };
}



// gerador pseudo-aleatório determinístico
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SYL = ['la', 'ro', 'che', 'vi', 'chy', 'eu', 'ce', 'rin', 'ave', 'ne', 'bio', 'der', 'ma', 'sol', 'gen', 'ems', 'med', 'ley', 'pra', 'ti', 'x', 'ç', 'ã', 'é', 'g1', ' ', ' ', '-', '10', '500', 'mg', 'cx', 'un'];

function makeWorld(seed: number) {
  const r = rng(seed);
  const word = (min: number, max: number) => {
    let w = '';
    const n = min + Math.floor(r() * (max - min + 1));
    while (w.length < n) w += SYL[Math.floor(r() * SYL.length)];
    return w;
  };
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const cats = [...CAT_KEYS] as CategoryKey[];

  const catalog = Array.from({ length: 60 }, () => ({
    nome: r() < 0.9 ? word(4, 14).toUpperCase() : '',
    codigo: r() < 0.5 ? String(Math.floor(r() * 40)) + (r() < 0.2 ? ' ' : '') : r() < 0.5 ? null : undefined,
    categoria: pick(cats),
  }));
  const productsByCategory = {} as ClassificationInputs['productsByCategory'];
  const brandKeywordsByCategory = {} as ClassificationInputs['brandKeywordsByCategory'];
  cats.forEach((k) => {
    productsByCategory[k] = Array.from({ length: 80 }, () => {
      const nome = word(3, 10);
      const withWords = r() < 0.6;
      return { nome, padrao: r() < 0.3 ? word(3, 8) : null, palavras: withWords ? Array.from({ length: 1 + Math.floor(r() * 3) }, () => (r() < 0.1 ? k : word(2, 7))) : [] };
    });
    brandKeywordsByCategory[k] = Array.from({ length: 15 }, () => (r() < 0.2 ? word(1, 2) : word(3, 7)));
  });
  const exclusiveBrands = r() < 0.7 ? Array.from({ length: 3 }, () => word(4, 8)) : [];
  const inputs: ClassificationInputs = { catalog, productsByCategory, brandKeywordsByCategory, exclusiveBrands };

  const names: { nome: string; codigo: string | null }[] = [];
  for (let i = 0; i < 400; i++) {
    const base = [word(2, 6), word(2, 6), r() < 0.3 ? pick(GENERIC_MARKERS) : '', r() < 0.2 ? pick(HEURISTICS[pick(cats)]) : ''].join(' ');
    names.push({ nome: r() < 0.05 ? '' : base, codigo: r() < 0.4 ? String(Math.floor(r() * 40)) : r() < 0.5 ? null : ' ' });
  }
  // nomes que vêm direto de regras (garante acertos e empates)
  catalog.slice(0, 10).forEach((c) => names.push({ nome: c.nome, codigo: null }));
  cats.forEach((k) => productsByCategory[k].slice(0, 6).forEach((p) => names.push({ nome: keywordsOf(p, k)[0] + ' ' + word(2, 4), codigo: null })));
  return { inputs, names };
}

describe('classifyProductTier (versão rápida) = versão antiga', () => {
  it('dá o mesmo resultado em milhares de casos aleatórios', () => {
    let compared = 0;
    let nonFallback = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { inputs, names } = makeWorld(seed);
      for (const { nome, codigo } of names) {
        for (const useFallback of [true, false]) {
          const expected: ClassificationResult = referenceClassify(nome, codigo, inputs, useFallback);
          const got = classifyProductTier(nome, codigo, inputs, useFallback);
          expect(got, `seed ${seed} nome=${JSON.stringify(nome)} cod=${codigo} fb=${useFallback}`).toEqual(expected);
          compared++;
          if (expected.tier < 5) nonFallback++;
        }
      }
    }
    expect(compared).toBeGreaterThan(9000);
    // o gerador precisa de fato produzir acertos nos níveis 1-4, senão o teste não prova nada
    expect(nonFallback).toBeGreaterThan(1500);
  });

  it('marca exclusiva vazia (texto em branco) continua virando MP, como antes', () => {
    const inputs: ClassificationInputs = {
      catalog: [],
      productsByCategory: { DERM: [], GEN: [], MP: [], MER: [] },
      brandKeywordsByCategory: { DERM: [], GEN: [], MP: [], MER: [] },
      exclusiveBrands: [' '],
    };
    expect(classifyProductTier('qualquer coisa', null, inputs)).toEqual(referenceClassify('qualquer coisa', null, inputs));
  });

  it('usa as marcas exclusivas padrão quando a loja não cadastrou nenhuma', () => {
    const inputs: ClassificationInputs = {
      catalog: [],
      productsByCategory: { DERM: [], GEN: [], MP: [], MER: [] },
      brandKeywordsByCategory: { DERM: [], GEN: [], MP: [], MER: [] },
      exclusiveBrands: [],
    };
    const nome = `Produto ${EXCLUSIVE_BRANDS_DEFAULT[0]} 30ml`;
    expect(classifyProductTier(nome, null, inputs).categoria).toBe('MP');
    expect(normalize(nome)).toContain(EXCLUSIVE_BRANDS_DEFAULT[0]);
  });
});
