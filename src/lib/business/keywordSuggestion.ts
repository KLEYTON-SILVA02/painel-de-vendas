// Deterministic "rótulo automático" for AJUSTE 1 — this system never uses
// AI to interpret text (same "sem IA" principle already applied to the
// DSM-OCR flow), so this is a FIXED, PREDICTABLE rule, not real
// understanding: it picks the longest token in the product name that
// isn't a unit/packaging/filler word or a plain number. It's meant as a
// starting-point suggestion the ADM can accept or ignore with one click —
// never applied automatically — and it will sometimes be wrong on
// non-obvious names (that tradeoff was flagged to and accepted by the
// user before this was built).
const STOPWORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'com',
  'sem',
  'para',
  'kit',
  'pct',
  'emb',
  'cx',
  'un',
  'und',
  'ml',
  'mg',
  'mcg',
  'gr',
  'g',
  'kg',
  'l',
  'lt',
  'c',
  'x',
]);

// Catches both plain numbers ("500") and a number glued to a unit suffix
// ("500ML", "90G", "1L") — tokenize() doesn't split those apart since
// digit+letter is one contiguous alnum run. Good enough for this domain
// (consumer product names): a token that starts with a digit is almost
// always a quantity, never the distinctive part of the name.
function isNumericToken(token: string): boolean {
  return /^\d+([.,]\d+)?[a-zA-ZÀ-ÿ]*$/.test(token);
}

/** Splits on anything that isn't a letter/digit, keeping the original
 * casing/accents of each token (this is a display suggestion, not a
 * matching key — classifyProductTier's own normalize() still owns the
 * actual comparison once the suggestion is applied as a keyword). */
function tokenize(nome: string): string[] {
  return nome.split(/[^a-zA-ZÀ-ÿ0-9]+/).filter(Boolean);
}

/** Returns a suggested keyword snippet for `nome`, or null when nothing
 * distinctive enough was found (every token was noise). */
export function suggestKeyword(nome: string): string | null {
  const tokens = tokenize(nome).filter((t) => {
    if (isNumericToken(t)) return false;
    if (t.length <= 2) return false;
    if (STOPWORDS.has(t.toLowerCase())) return false;
    return true;
  });
  if (tokens.length === 0) return null;
  return tokens.reduce((best, t) => (t.length > best.length ? t : best), tokens[0]);
}
