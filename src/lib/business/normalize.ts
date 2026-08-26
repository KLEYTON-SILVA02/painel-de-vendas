// Ported 1:1 from legacy/index-original.html (function normalize)
const DIACRITICS_RE = /[̀-ͯ]/g;

export function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .trim();
}
