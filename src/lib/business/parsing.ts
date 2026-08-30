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
