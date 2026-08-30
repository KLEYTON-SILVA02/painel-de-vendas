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

/** Ranking/identification fallback when no apelido was registered: just
 * the first name — never the full name — matching the "primeiro nome"
 * convention an explicitly registered apelido already follows. */
export function firstName(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}
