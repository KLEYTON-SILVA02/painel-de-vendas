// Ported 1:1 from legacy/index-original.html — classifyProduct / classifyProductTier / classifyBio.
// Priority order is a business rule, not an implementation detail: catalog exact match (1) >
// per-product keywords (2) > per-brand keywords (3) > heuristics (4) > "Mercadoria Geral" fallback (5),
// then the exclusive-brands rule always overrides the result to MP regardless of tier.
import { normalize } from './normalize';

export const CAT_KEYS = ['DERM', 'GEN', 'MP', 'MER'] as const;
export type CategoryKey = (typeof CAT_KEYS)[number];

export const BIO_GROUP_KEYS = ['G1', 'G2', 'G3', 'G4'] as const;
/** A free-text group code, scoped to one category_type — BIOSINTÉTICA's own
 * groups happen to always be G1-G4 today (BIO_GROUP_KEYS), but the type
 * itself no longer assumes that: a different category type can define
 * however many groups it wants, with whatever codes it wants. */
export type BioGroupKey = string;

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

// Exportado para o scanner de palavras-chave em ProdutosPage.tsx (Escanear
// produtos correspondentes) reaproveitar a mesma lista em vez de duplicá-la
// — sem isso, um marcador novo adicionado aqui não seria refletido lá.
export const GENERIC_MARKERS = ['generico', 'genérico', 'similar', ' gen ', ' gn ', 'g-ems', 'gn-med'];

/** @internal exportado só para o teste de equivalência */
export const HEURISTICS: Record<CategoryKey, string[]> = {
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

/** A bulk-imported product/BIO-group row's own "Tipo"/"Categoria" cell
 * sometimes ends up as its ONLY keyword — e.g. a row for a specific GEN
 * product gets `palavras: ['GEN']` instead of a real product-identifying
 * keyword, or a Biosintética product gets `palavras: ['G1']`. Once that
 * happens, `n.includes(pad)` matches essentially any sale whose product
 * name happens to contain that 2-3 letter substring anywhere — a real
 * production incident: every GEN and MP product in this store's catalog
 * had exactly this corruption (palavras === [categoria]), turning "does
 * this contain 'gen'?" into the de facto GEN rule and pulling in unrelated
 * sales (syringes, needles, dermo creams — anything with "g1"/"g2"/... in
 * a compressed SKU code) into the Biosintética G1-G4 lists. A keyword that
 * exactly equals the category/group code it's filed under is never a real
 * product identifier, so it's discarded here and the product's own name is
 * used instead — the same fallback used when `palavras` is empty. */
/** @internal exportado só para o teste de equivalência */
export function keywordsOf(item: KeywordItem, categoryCode?: string): string[] {
  const raw = item.palavras && item.palavras.length ? item.palavras : [item.padrao || item.nome];
  if (!categoryCode) return raw;
  const codeNorm = normalize(categoryCode);
  const cleaned = raw.filter((kw) => normalize(kw) !== codeNorm);
  return cleaned.length ? cleaned : [item.nome];
}

/**
 * Classifies a product into one of the 4 sale categories, honoring the same
 * priority order and the exclusive-brands override as the legacy system.
 * Returns tier=5 whenever nothing matched and MER was used as universal fallback.
 */
interface PreparedKeyword {
  k: CategoryKey;
  len: number;
  /** Posição na ordem original de varredura — desempata (o 1º vence) como o `sort` estável fazia. */
  idx: number;
  pad: string;
}

/** Tudo que `classifyProductTier` precisava recalcular a CADA venda (normalizar
 * 1.600 nomes do catálogo, ~9.000 palavras de produto, as marcas...) é feito uma
 * única vez por conjunto de regras. Com a loja grande, o cache do normalize()
 * (8 mil entradas) estourava no meio de cada chamada e era esvaziado — o que
 * deixava cada classificação em ~3 ms e a Auditoria em mais de 5 minutos para
 * 100 mil vendas. O resultado é idêntico ao do cálculo antigo (ver teste). */
interface PreparedInputs {
  catalogByCode: Map<string, number>;
  catalogByName: Map<string, number>;
  catalogCats: CategoryKey[];
  /** palavras de produto (tier 2, >= 3 letras) indexadas pelas 3 primeiras letras */
  productByTrigram: Map<string, PreparedKeyword[]>;
  /** palavras de marca (tier 3) com >= 3 letras, idem */
  brandByTrigram: Map<string, PreparedKeyword[]>;
  /** palavras de marca com 1-2 letras (raras): varridas uma a uma */
  brandShort: PreparedKeyword[];
  exclusive: string[];
}

const preparedCache = new WeakMap<ClassificationInputs, PreparedInputs>();

function addToIndex(index: Map<string, PreparedKeyword[]>, kw: PreparedKeyword) {
  const key = kw.pad.slice(0, 3);
  const list = index.get(key);
  if (list) list.push(kw);
  else index.set(key, [kw]);
}

function prepareInputs(inputs: ClassificationInputs): PreparedInputs {
  const cached = preparedCache.get(inputs);
  if (cached) return cached;

  const catalogByCode = new Map<string, number>();
  const catalogByName = new Map<string, number>();
  const catalogCats: CategoryKey[] = [];
  inputs.catalog.forEach((c, i) => {
    catalogCats.push(c.categoria);
    if (c.codigo) {
      const code = c.codigo.toString().trim();
      if (code && !catalogByCode.has(code)) catalogByCode.set(code, i);
    }
    if (c.nome) {
      const nn = normalize(c.nome);
      if (nn && !catalogByName.has(nn)) catalogByName.set(nn, i);
    }
  });

  const productByTrigram = new Map<string, PreparedKeyword[]>();
  let idx = 0;
  CAT_KEYS.forEach((k) => {
    (inputs.productsByCategory[k] || []).forEach((p) => {
      keywordsOf(p, k).forEach((kw) => {
        const pad = normalize(kw);
        if (pad && pad.length >= 3) addToIndex(productByTrigram, { k, len: pad.length, idx: idx++, pad });
      });
    });
  });

  const brandByTrigram = new Map<string, PreparedKeyword[]>();
  const brandShort: PreparedKeyword[] = [];
  let bidx = 0;
  CAT_KEYS.forEach((k) => {
    (inputs.brandKeywordsByCategory[k] || []).forEach((kw) => {
      const pad = normalize(kw);
      if (!pad) return;
      const entry = { k, len: pad.length, idx: bidx++, pad };
      if (pad.length >= 3) addToIndex(brandByTrigram, entry);
      else brandShort.push(entry);
    });
  });

  const brands = inputs.exclusiveBrands.length ? inputs.exclusiveBrands : EXCLUSIVE_BRANDS_DEFAULT;
  const prepared: PreparedInputs = {
    catalogByCode,
    catalogByName,
    catalogCats,
    productByTrigram,
    brandByTrigram,
    brandShort,
    exclusive: brands.map((b) => normalize(b)),
  };
  preparedCache.set(inputs, prepared);
  return prepared;
}

/** Entre as palavras que aparecem em `n`, a mais longa (empate: a 1ª na ordem original). */
function bestKeywordIn(n: string, index: Map<string, PreparedKeyword[]>, accept?: (k: PreparedKeyword) => boolean): PreparedKeyword | null {
  let best: PreparedKeyword | null = null;
  for (let i = 0; i + 3 <= n.length; i++) {
    const list = index.get(n.slice(i, i + 3));
    if (!list) continue;
    for (const kw of list) {
      if (best && (kw.len < best.len || (kw.len === best.len && kw.idx > best.idx))) continue;
      if (!n.includes(kw.pad)) continue;
      if (accept && !accept(kw)) continue;
      best = kw;
    }
  }
  return best;
}

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
  const prep = prepareInputs(inputs);

  let result: CategoryKey | null = null;
  let tier: 1 | 2 | 3 | 4 | 5 = 5;

  // Tier 1 — exact catalog match by code or name (highest priority). When both
  // a code and a name hit different rows, the row that comes first in the
  // catalog wins (same as the old `.find`).
  const codN = (codigo || '').toString().trim();
  const byCode = codN ? prep.catalogByCode.get(codN) : undefined;
  const byName = prep.catalogByName.get(n);
  const catIdx = byCode !== undefined && byName !== undefined ? Math.min(byCode, byName) : (byCode ?? byName);
  if (catIdx !== undefined) {
    result = prep.catalogCats[catIdx];
    tier = 1;
  }

  // Tier 2 — per-product keywords across all categories (longest match wins)
  if (!result) {
    const best = bestKeywordIn(n, prep.productByTrigram);
    if (best) {
      result = best.k;
      tier = 2;
    }
  }

  // Tier 3 — brand keywords per category (GEN requires a generic marker too)
  if (!result) {
    let hasMarker: boolean | null = null;
    const accept = (kw: PreparedKeyword) => {
      if (kw.k !== 'GEN') return true;
      if (hasMarker === null) hasMarker = GENERIC_MARKERS.some((m) => n.includes(m.trim()));
      return hasMarker;
    };
    let best = bestKeywordIn(n, prep.brandByTrigram, accept);
    for (const kw of prep.brandShort) {
      if (best && (kw.len < best.len || (kw.len === best.len && kw.idx > best.idx))) continue;
      if (n.includes(kw.pad) && accept(kw)) best = kw;
    }
    if (best) {
      result = best.k;
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
  if (prep.exclusive.some((b) => n.includes(b))) {
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
 * Independent partnership-category classification (BIOSINTÉTICA today) —
 * links a product to one of `bioGroups`' own keys, or null when it doesn't
 * belong to any of them. Longest keyword match wins. Iterates whatever
 * group codes are actually present in `bioGroups` rather than a fixed
 * G1-G4 list, so it works for any category's own group set.
 */
export function classifyBio(
  nome: string,
  bioGroups: Record<BioGroupKey, KeywordItem[]>,
): BioGroupKey | null {
  const n = normalize(nome);
  if (!n) return null;
  const matches: { g: BioGroupKey; len: number }[] = [];
  Object.keys(bioGroups).forEach((g) => {
    (bioGroups[g] || []).forEach((p) => {
      keywordsOf(p, g).forEach((kw) => {
        const pad = normalize(kw);
        // >= 3, matching classifyProductTier's tier-2 threshold — a 2-char
        // keyword ("g1", "mp"...) is exactly the pattern the corrupted-data
        // incident above produced, and is never a real product identifier.
        if (pad && pad.length >= 3 && n.includes(pad)) matches.push({ g, len: pad.length });
      });
    });
  });
  if (!matches.length) return null;
  matches.sort((a, b) => b.len - a.len);
  return matches[0].g;
}

/** Whether `nome` contains one of `substances`' own names as a substring
 * (normalized) — same >=3-char threshold as classifyProductTier's own
 * keyword tiers, so a very short substance name can't accidentally match
 * anything containing it. Used by the Genéricos "Substâncias" scan
 * (ProdutosPage) to find products not yet classified as GEN whose name
 * names a known active substance — unlike Tier 3's brand keywords, this
 * check needs no "generic marker" gate (a substance name is itself
 * definitive proof the product is a drug). */
export function matchesGenericSubstance(nome: string, substances: { nome: string }[]): boolean {
  const n = normalize(nome);
  if (!n || !substances.length) return false;
  return substances.some((s) => {
    const pad = normalize(s.nome);
    return pad.length >= 3 && n.includes(pad);
  });
}
