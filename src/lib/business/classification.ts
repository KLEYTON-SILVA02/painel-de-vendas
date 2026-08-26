// Ported 1:1 from legacy/index-original.html — classifyProduct / classifyProductTier / classifyBio.
// Priority order is a business rule, not an implementation detail: catalog exact match (1) >
// per-product keywords (2) > per-brand keywords (3) > heuristics (4) > "Mercadoria Geral" fallback (5),
// then the exclusive-brands rule always overrides the result to MP regardless of tier.
import { normalize } from './normalize';

export const CAT_KEYS = ['DERM', 'GEN', 'MP', 'MER'] as const;
export type CategoryKey = (typeof CAT_KEYS)[number];

export const BIO_GROUP_KEYS = ['G1', 'G2', 'G3', 'G4'] as const;
export type BioGroupKey = (typeof BIO_GROUP_KEYS)[number];

export const EXCLUSIVE_BRANDS_DEFAULT = [
  'dauf', 'ativday', 'be better', 'amoravel', 'eco clinic',
  'pague menos', 'p menos', 'choices', 'nutrabix', 'levmel', 'vita mais',
];

const GENERIC_MARKERS = ['generico', 'genérico', 'similar', ' gen ', ' gn ', 'g-ems', 'gn-med'];

const HEURISTICS: Record<CategoryKey, string[]> = {
  MP: ['needs', 'sensi', 'genyo', 'farma22', 'nutrissi'],
  DERM: [
    'la roche', 'vichy', 'eucerin', 'avene', 'cerave', 'bioderma', 'isdin',
    'neutrogena', 'anthelios', 'protetor solar', 'serum', 'maybelline', 'vult',
    'adcos', 'theraskin',
  ],
  GEN: [
    'ems', 'medley', 'germed', 'cimed', 'neo quimica', 'prati', 'teuto',
    'sandoz', 'eurofarma', 'geolab', 'legrand', 'hipolabor', 'natulab', 'biolab',
  ],
  MER: [
    'sabonete', 'shampoo', 'condicionador', 'fralda', 'absorvente', 'creme dental',
    'agua', 'chocolate', 'refrigerante', 'papel higienico', 'desodorante', 'algodao', 'leite',
  ],
};

export interface KeywordItem {
  nome: string;
  padrao?: string | null;
  palavras: string[];
}

export interface CatalogEntry {
  nome: string;
  codigo?: string | null;
  categoria: CategoryKey;
}

export interface ClassificationInputs {
  catalog: CatalogEntry[];
  productsByCategory: Record<CategoryKey, KeywordItem[]>;
  brandKeywordsByCategory: Record<CategoryKey, string[]>;
  exclusiveBrands: string[];
}

export interface ClassificationResult {
  categoria: CategoryKey;
  tier: 1 | 2 | 3 | 4 | 5;
}

function keywordsOf(item: KeywordItem): string[] {
  return item.palavras && item.palavras.length ? item.palavras : [item.padrao || item.nome];
}

/**
 * Classifies a product into one of the 4 sale categories, honoring the same
 * priority order and the exclusive-brands override as the legacy system.
 * Returns tier=5 whenever nothing matched and MER was used as universal fallback.
 */
export function classifyProductTier(
  nome: string,
  codigo: string | null | undefined,
  inputs: ClassificationInputs,
): ClassificationResult {
  const n = normalize(nome);
  let result: CategoryKey | null = null;
  let tier: 1 | 2 | 3 | 4 | 5 = 5;

  if (n) {
    // Tier 1 — exact catalog match by code or name (highest priority)
    const codN = (codigo || '').toString().trim();
    const cat = inputs.catalog.find(
      (c) =>
        (codN && c.codigo && c.codigo.toString().trim() === codN) ||
        (c.nome && normalize(c.nome) === n),
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
          keywordsOf(p).forEach((kw) => {
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

    // Tier 5 — nothing matched: Mercadoria Geral is the universal fallback
    if (!result) {
      result = 'MER';
      tier = 5;
    }

    // Exclusive-brand rule: always recategorizes to MP, even over a match found above
    const brands = inputs.exclusiveBrands.length ? inputs.exclusiveBrands : EXCLUSIVE_BRANDS_DEFAULT;
    if (brands.some((b) => n.includes(normalize(b)))) {
      result = 'MP';
    }
  } else {
    result = 'MER';
    tier = 5;
  }

  return { categoria: result, tier };
}

export function classifyProduct(
  nome: string,
  codigo: string | null | undefined,
  inputs: ClassificationInputs,
): CategoryKey {
  return classifyProductTier(nome, codigo, inputs).categoria;
}

/**
 * Independent BIOSINTÉTICA classification — links a product to a G1-G4 group,
 * or null when it doesn't belong to any of them. Longest keyword match wins.
 */
export function classifyBio(
  nome: string,
  bioGroups: Record<BioGroupKey, KeywordItem[]>,
): BioGroupKey | null {
  const n = normalize(nome);
  if (!n) return null;
  const matches: { g: BioGroupKey; len: number }[] = [];
  BIO_GROUP_KEYS.forEach((g) => {
    (bioGroups[g] || []).forEach((p) => {
      keywordsOf(p).forEach((kw) => {
        const pad = normalize(kw);
        if (pad && pad.length >= 2 && n.includes(pad)) matches.push({ g, len: pad.length });
      });
    });
  });
  if (!matches.length) return null;
  matches.sort((a, b) => b.len - a.len);
  return matches[0].g;
}
