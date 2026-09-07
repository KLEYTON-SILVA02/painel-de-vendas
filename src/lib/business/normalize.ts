// Ported 1:1 from legacy/index-original.html (function normalize)
const DIACRITICS_RE = /[̀-ͯ]/g;

// normalize() is pure (same input always yields the same output) and gets
// called with a small, highly-repeated universe of strings — the same
// catalog/keyword texts checked against every sale row during classification
// (see classification.ts) — so a large fraction of calls are redundant work
// on strings already normalized moments earlier. Caching turns those repeat
// calls into a Map lookup instead of a fresh toLowerCase/NFD/regex pass,
// which is where most of the cost of classifying thousands of sale rows
// (sales import, Biosintética, Auditoria) actually goes. Capped and cleared
// instead of left unbounded, since a session can in principle touch a lot of
// distinct product-name text over its lifetime.
const normalizeCache = new Map<string, string>();
const NORMALIZE_CACHE_LIMIT = 8000;

export function normalize(s: string | null | undefined): string {
  const raw = (s ?? '').toString();
  const cached = normalizeCache.get(raw);
  if (cached !== undefined) return cached;
  const result = raw.toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '').trim();
  if (normalizeCache.size >= NORMALIZE_CACHE_LIMIT) normalizeCache.clear();
  normalizeCache.set(raw, result);
  return result;
}

/** Ranking/identification fallback when no apelido was registered: just
 * the first name — never the full name — matching the "primeiro nome"
 * convention an explicitly registered apelido already follows. */
export function firstName(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}
