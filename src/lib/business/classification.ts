// Ported 1:1 from legacy/index-original.html — classifyProduct / classifyProductTier / classifyBio.
// Priority order is a business rule, not an implementation detail: catalog exact match (1) >
// per-product keywords (2) > per-brand keywords (3) > heuristics (4) > "Mercadoria Geral" fallback (5),
// then the exclusive-brands rule always overrides the result to MP regardless of tier.
import { normalize } from './normalize';

export const CAT_KEYS = ['DERM', 'GEN', 'MP', 'MER'] as const;
export type CategoryKey = (typeof CAT_KEYS)[number];

export const BIO_GROUP_KEYS = ['G1', 'G2', 'G3', 'G4'] as const;
export type BioGroupKey = (typeof BIO_GROUP_KEYS)[number];

/** Levmel/Chip aren't CategoryKeys — they're classified at runtime via
 * special_lists keyword matching, not the sale.grupo field like DERM/GEN/MP/
 * MER — but they share the same `goals` table/row shape (categoria is a
 * plain string column), so the goals infrastructure (useGoals/useUpdateGoal)
 * is reused for their Meta Mensal/Diária instead of a second table. */
export const GOAL_UNIT_KEYS = ['LEVMEL', 'CHIP'] as const;
export type GoalCategoryKey = CategoryKey | (typeof GOAL_UNIT_KEYS)[number];

/** Maps a free-text "Categoria" cell from a bulk product-import spreadsheet
 * (e.g. "Dermocosmético", "Genérico", "Marca Exclusiva", "MP"...) onto a
 * CategoryKey. Anything unrecognized falls back to MER ("Mercadoria
 * Geral") per spec — it still lands in Catálogo, just available for
 * recategorization instead of being silently dropped. */
export function normalizeCategoriaImport(raw: string): CategoryKey {
  const n = normalize(raw);
  if (!n) return 'MER';
  if (n.includes('derm')) return 'DERM';
  if (n.includes('exclusiv') || n === 'mp' || n.includes('marca')) return 'MP';
  if (n.includes('gen') || n.includes('similar')) return 'GEN';
  return 'MER';
}

/** Maps a free-text "Categoria"/"Grupo" cell from the Biosintética
 * product-import spreadsheet ("G1", "Grupo 1", "Categoria 1", "1"...) onto
 * a BioGroupKey. Extracts the last standalone digit 1-4 in the cell rather
 * than matching a literal "g1" substring — "Grupo 1" normalizes to
 * "grupo1", which does NOT contain "g1" as consecutive characters, so the
 * previous substring check silently rejected the exact labels the UI
 * itself uses (Grupo 1/2/3/4), making bulk import look broken. Returns
 * null when no digit 1-4 is found — the Biosintética grouping has no
 * sensible default group to fall back to, unlike the general-products
 * import's MER fallback. */
export function normalizeGrupoImport(raw: string): BioGroupKey | null {
  const n = normalize(raw);
  if (!n) return null;
  const digits = n.match(/(?<!\d)[1-4](?!\d)/g);
  if (!digits) return null;
  return (`G${digits[digits.length - 1]}` as BioGroupKey);
}

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
  categoria: CategoryKey | null;
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

export function classifyProduct(
  nome: string,
  codigo: string | null | undefined,
  inputs: ClassificationInputs,
): CategoryKey {
  // useFallback defaults to true here, so categoria is guaranteed non-null.
  return classifyProductTier(nome, codigo, inputs).categoria!;
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
