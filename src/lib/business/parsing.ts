// Ported 1:1 from legacy/index-original.html (parseNumeroBR / parseDateISO)

/** Cell value for an ID-like spreadsheet column (matrícula, código de
 * produto): prefers the raw numeric value over a display-formatted one,
 * since a source spreadsheet that applies a zero-padding number mask to
 * the column (e.g. "70202407" shown as "00070202407") would otherwise get
 * baked into the imported data. Pass both a `raw:true` and a `raw:false`
 * SheetJS read of the same cell. */
export function idFromCell(rawVal: unknown, formattedVal: unknown): string {
  if (typeof rawVal === 'number' && Number.isFinite(rawVal)) return String(Math.trunc(rawVal));
  return String(formattedVal ?? '').trim();
}

/** Strips leading zeros from a matrícula/employee-ID string, so the same
 * real person's ID always compares equal no matter which zero-padding
 * convention the source spreadsheet used for it — this is the value that
 * joins a sale to its registered collaborator (ranking, apelido, photo,
 * individual goals all key off it). idFromCell already defeats a *number
 * format mask* on a genuine numeric cell, but does nothing when the
 * matrícula column is stored as plain text with the padding baked into
 * the digits themselves (e.g. "070209751") — which is exactly what
 * happened here: the sales sheet's matrícula column came in as text
 * ("070209751", 9 digits) while the collaborators sheet's came in as a
 * real number ("70209751", 8 digits, via idFromCell). Same person, two
 * different stored strings, so no sale ever matched its collaborator —
 * every one fell back to an unmatched/synthesized row instead. Applied
 * on read (mapSale/mapCollaborator) so this self-heals for data already
 * in the database, not just new imports. */
export function normalizeMatricula(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return trimmed;
  return trimmed.replace(/^0+(?=\d)/, '');
}

/** Parses a BR/US formatted number, optionally prefixed with "R$" or wrapped in
 * parentheses for negatives. Decimal separator is inferred from whichever of
 * "," or "." appears last in the string. */
export function parseNumeroBR(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  let s = raw.toString().trim();
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/r\$\s?/i, '').replace(/\s/g, '').trim();
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let sep: ',' | '.' | null = null;
  if (lastComma > -1 && lastDot > -1) sep = lastComma > lastDot ? ',' : '.';
  else if (lastComma > -1) sep = ',';
  else if (lastDot > -1) sep = '.';

  let intPart: string;
  let decPart: string;
  if (sep) {
    const idx = s.lastIndexOf(sep);
    intPart = s.slice(0, idx).replace(/[.,]/g, '');
    decPart = s.slice(idx + 1).replace(/[^\d]/g, '');
  } else {
    intPart = s.replace(/[^\d-]/g, '');
    decPart = '';
  }
  let num = parseFloat(intPart + (decPart ? '.' + decPart : ''));
  if (isNaN(num)) num = 0;
  return neg ? -num : num;
}

/** Parses DD/MM/YYYY (or YY) and YYYY-MM-DD into an ISO date string (YYYY-MM-DD). */
export function parseDateISO(str: unknown): string | null {
  if (!str) return null;
  const s = str.toString().trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const [, d, mo] = m;
    let y = m[3];
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
  return null;
}

/** Cell value for a date column: prefers deriving the ISO date from a raw
 * Date object's UTC calendar-date components over parsing the formatted
 * display text. SheetJS (`cellDates: true`) formats a real Excel date cell
 * using the *browser's local timezone* — for any timezone behind UTC (e.g.
 * Brazil, UTC-3) that rolls a date-only value back a day: a sale on Aug 24
 * gets formatted as "23/08/2026". Every single-day filter then misses it
 * (wrong day), while whole-month totals still look right (still the same
 * month, just attributed to the wrong day) — which is why this only
 * surfaced as "single-day filters don't work". The raw cell keeps the
 * original Date object, whose UTC getters aren't affected by that
 * conversion. Falls back to parsing the formatted text for plain-text date
 * cells (CSV imports, or a column already stored as text), which were
 * never affected since no Date-object conversion happens for those. */
export function dateFromCell(rawVal: unknown, formattedVal: unknown): string | null {
  if (rawVal instanceof Date && !Number.isNaN(rawVal.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${rawVal.getUTCFullYear()}-${pad(rawVal.getUTCMonth() + 1)}-${pad(rawVal.getUTCDate())}`;
  }
  return parseDateISO(formattedVal);
}
