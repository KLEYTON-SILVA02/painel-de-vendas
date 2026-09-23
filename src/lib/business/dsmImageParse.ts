// DSM ("Desconto Só Meu") — Fase 3: extrai linhas de colaborador a partir
// de texto solto (o resultado do OCR sobre um print do relatório, ou texto
// colado manualmente pelo ADM quando o OCR falha — mesmo caminho "colar
// texto" já usado pelo Super Troco do sistema antigo). Diferente da
// planilha (dsmImport.ts), aqui não há colunas reais — só linhas de texto,
// então a extração é por padrão de linha, não por índice de coluna.
//
// Formato de cada linha esperado (mesmo do relatório usado na Fase 2):
// "<matrícula>-<NOME>  <número de vendas>  <valor R$>  <número de clientes>"
// — o número de clientes é sempre o último token numérico da linha (a
// coluna mais à direita no relatório original), então a extração pega
// sempre o ÚLTIMO número da linha como quantidade, funcione a linha com
// 1, 2 ou 3 números à direita do nome.
import type { DsmReviewRow } from './dsmImport';
import { normalizeMatricula } from './parsing';

const FOOTER_LINE_PATTERN = /\b(sub)?tota(l|is)\b/i;
const NAO_IDENTIFICADO_PATTERN = /n[ãa]o\s+identificad/i;
const MATRICULA_NAME_LINE = /^(\d{4,10})\s*[-–—]\s*(.+)$/;

export interface DsmImageLineMatch {
  lineRaw: string;
  matriculaRaw: string;
  matricula: string;
  nome: string;
  quantidade: number | null;
}

/** Splits the trailing run of whitespace-separated numeric tokens off the
 * end of `text` (a name possibly followed by "vendas  valor  clientes") —
 * returns the leading non-numeric part (the name) and the LAST numeric
 * token found (quantidade), stripped of thousands separators. Returns
 * quantidade: null when the line has no trailing number at all (still
 * shown in the review table, just excluded from saving until the ADM
 * fills it in manually — same "don't guess" rule as everywhere else in
 * DSM). */
function splitNameAndTrailingNumber(text: string): { nome: string; quantidade: number | null } {
  const tokens = text.trim().split(/\s+/);
  // Walks backward to find where the trailing run of numeric-looking
  // tokens *starts* (there can be several — vendas, valor, clientes) —
  // quantidade always comes from the very last token specifically (the
  // rightmost column), not from wherever the run happens to start.
  let numericRunStart = tokens.length;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/^[\d.,]+$/.test(tokens[i])) numericRunStart = i;
    else break;
  }
  if (numericRunStart === tokens.length) return { nome: text.trim(), quantidade: null };
  const nome = tokens.slice(0, numericRunStart).join(' ').trim();
  const digitsOnly = tokens[tokens.length - 1].replace(/\D/g, '');
  const quantidade = digitsOnly ? parseInt(digitsOnly, 10) : null;
  return { nome, quantidade };
}

/** Parses every line of OCR (or manually pasted) text into candidate DSM
 * rows — one line at a time, independent of any table structure (there
 * isn't one once it's plain text). Lines that don't look like a
 * colaborador row (headers, "TOTAL...", blank lines, OCR noise) are
 * silently skipped rather than guessed at. */
export function parseDsmImageLines(text: string): DsmImageLineMatch[] {
  const out: DsmImageLineMatch[] = [];
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || FOOTER_LINE_PATTERN.test(line)) continue;

    const m = line.match(MATRICULA_NAME_LINE);
    if (m) {
      const matriculaRaw = m[1];
      const { nome, quantidade } = splitNameAndTrailingNumber(m[2]);
      if (!nome) continue;
      out.push({ lineRaw: line, matriculaRaw, matricula: normalizeMatricula(matriculaRaw), nome, quantidade });
      continue;
    }

    if (NAO_IDENTIFICADO_PATTERN.test(line)) {
      const { quantidade } = splitNameAndTrailingNumber(line);
      out.push({ lineRaw: line, matriculaRaw: '', matricula: '', nome: 'NÃO IDENTIFICADO', quantidade });
    }
  }
  return out;
}

const DATE_IN_TEXT = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/;

/** Best-effort search for a DD/MM/AAAA-shaped date anywhere in OCR text —
 * used only to pre-fill the date field when the image happens to show one;
 * the field always stays editable, and the ADM must fill it in themselves
 * when nothing is found (see the file comment in DsmImageImportSection). */
export function detectDateInText(text: string): string | null {
  const m = text.match(DATE_IN_TEXT);
  if (!m) return null;
  const [, d, mo, yRaw] = m;
  const day = parseInt(d, 10);
  const month = parseInt(mo, 10);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const year = yRaw.length === 2 ? 2000 + parseInt(yRaw, 10) : parseInt(yRaw, 10);
  if (year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** True when `line` is plausibly a header/furniture line worth hiding from
 * the raw-text preview noise count, e.g. "Loja Matrícula Nome..." — not
 * used for filtering (parseDsmImageLines already only accepts matching
 * lines), just exported for a nicer "N linhas reconhecidas" summary. */
export function countRecognizedLines(text: string): number {
  return parseDsmImageLines(text).length;
}

/** Builds the same DsmReviewRow[] the planilha path produces
 * (buildDsmReviewRows in dsmImport.ts), from OCR/pasted-text matches
 * instead — every row shares the one date chosen for the whole image
 * (there's no per-row date in a single print, unlike a planilha spanning
 * several days), and a line with no trailing number reads as
 * quantidade: 0 here (still shown for the ADM to fill in during review,
 * same as any other value they might need to correct). */
export function buildDsmReviewRowsFromImage(
  matches: DsmImageLineMatch[],
  dataISO: string,
  collaboratorByMatricula: Map<string, { id: string }>,
): DsmReviewRow[] {
  return matches.map((m, i) => ({
    key: `${i}-${m.matriculaRaw || m.nome}`,
    matriculaRaw: m.matriculaRaw ? `${m.matriculaRaw}-${m.nome}` : m.nome,
    matricula: m.matricula,
    nomeFonte: m.nome,
    collaboratorId: m.matricula ? (collaboratorByMatricula.get(m.matricula)?.id ?? null) : null,
    dataISO,
    quantidade: m.quantidade ?? 0,
  }));
}
