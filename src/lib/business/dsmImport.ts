// DSM ("Desconto Só Meu") — Fase 2: parsing de planilha.
//
// Modelado no arquivo de exemplo fornecido pelo usuário nesta sessão: a
// coluna "Matrícula - Nome funcionário" vem mesclada tanto na horizontal
// (3 colunas) quanto na vertical (uma célula cobrindo todos os dias
// daquele colaborador) — a leitura de planilha (SheetJS) só preenche a
// célula de cima-esquerda de cada mesclagem, deixando as demais vazias,
// então é preciso "preencher pra baixo" manualmente (fillMergedCells).
//
// Cada bloco de colaborador termina com uma linha de subtotal sem data, e a
// última linha do arquivo inteiro é um total geral (também sem data) — a
// regra "sem data = ignorar" cobre os dois casos de uma vez, sem depender
// de reconhecer texto "Total"/"Subtotal" (que nem sempre aparece).
import { normalize } from './normalize';
import { dateFromCell, normalizeMatricula, parseNumeroBR } from './parsing';

export interface DsmColumnMap {
  matriculaNome: number;
  data: number;
  quantidade: number;
}

const MATRICULA_NOME_TERMS = ['matricula', 'matrícula'];
const DATA_TERMS = ['data'];
const QUANTIDADE_TERMS = ['numero de clientes', 'número de clientes', 'clientes', 'conversoes', 'conversões'];

// The real report wraps its header text onto two lines inside the cell
// ("Número de\nClientes") — collapsing all whitespace (including that
// newline) down to single spaces before comparing means a term like
// "numero de clientes" still matches it, the same as a header that happens
// to fit on one line.
function normalizeHeader(h: unknown): string {
  return normalize(h as string).replace(/\s+/g, ' ').trim();
}

/** Scans the first 15 rows for a header row hitting both the matrícula and
 * data terms — same "first row with enough hits" strategy as the sales
 * import's detectHeaderRow (importMapping.ts), kept separate since DSM's
 * header text doesn't overlap with the sales header terms. */
export function detectDsmHeaderRow(rows: unknown[][]): number {
  const scan = Math.min(15, rows.length);
  for (let i = 0; i < scan; i++) {
    const row = rows[i].map((c) => normalizeHeader(c));
    const hasMatricula = row.some((cell) => MATRICULA_NOME_TERMS.some((t) => cell.includes(normalizeHeader(t))));
    const hasData = row.some((cell) => DATA_TERMS.some((t) => cell.includes(normalizeHeader(t))));
    if (hasMatricula && hasData) return i;
  }
  return 0;
}

export function mapDsmColumns(headers: unknown[]): DsmColumnMap {
  const norm = headers.map((h) => normalizeHeader(h));
  // "Número de Clientes(%)" is a separate percentage column right next to
  // the count we actually want — excluded here so it never wins the match
  // just for containing the same "clientes" substring.
  const find = (terms: string[], exclude?: RegExp) => {
    for (const t of terms) {
      const idx = norm.findIndex((h) => h.includes(normalizeHeader(t)) && !(exclude && exclude.test(h)));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    matriculaNome: find(MATRICULA_NOME_TERMS),
    data: find(DATA_TERMS),
    quantidade: find(QUANTIDADE_TERMS, /%/),
  };
}

/** Splits a "70208345-DEIVESON RAMOS PAIVA" cell into matrícula (normalized)
 * and nome. The nome half is only ever shown as a hint — matching a
 * colaborador is always by matrícula, and the name actually displayed
 * everywhere else in the system is the registered apelido, never this
 * text (which the source report itself sometimes truncates). */
export function splitMatriculaNome(raw: string): { matricula: string; nome: string } {
  const trimmed = (raw ?? '').trim();
  const m = trimmed.match(/^(\d+)\s*-\s*(.*)$/);
  if (!m) return { matricula: '', nome: trimmed };
  return { matricula: normalizeMatricula(m[1]), nome: m[2].trim() };
}

export interface MergeRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

/** Fills every cell inside a merged rectangle with the top-left cell's
 * value, wherever the flat row read otherwise left it blank. Mutates
 * `rows` in place; only ever writes into a cell that's still empty, so it
 * can never overwrite real data. */
export function fillMergedCells(rows: unknown[][], merges: MergeRange[]): void {
  for (const m of merges) {
    const topValue = rows[m.s.r]?.[m.s.c];
    if (topValue === undefined || topValue === '') continue;
    for (let r = m.s.r; r <= m.e.r; r++) {
      if (!rows[r]) continue;
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        if (rows[r][c] === undefined || rows[r][c] === '') rows[r][c] = topValue;
      }
    }
  }
}

export interface DsmParsedRow {
  matriculaRaw: string;
  matricula: string;
  nomePlanilha: string;
  dataISO: string | null;
  dataRaw: string;
  quantidade: number;
}

/** Parses the day-rows out of a DSM sheet whose merged cells have already
 * been filled (see fillMergedCells) — skips any row with no data value,
 * which is exactly the two kinds of summary line in the real file this was
 * modeled on (each colaborador's own subtotal, and the grand-total row at
 * the very end). */
export function parseDsmRows(rows: unknown[][], rawRows: unknown[][], map: DsmColumnMap): DsmParsedRow[] {
  const out: DsmParsedRow[] = [];
  rows.forEach((r, i) => {
    const dataRaw = map.data >= 0 ? String(r[map.data] ?? '').trim() : '';
    if (!dataRaw) return;
    const rr = rawRows[i] ?? [];
    const dataISO = map.data >= 0 ? dateFromCell(rr[map.data], dataRaw) : null;
    const matriculaNomeRaw = map.matriculaNome >= 0 ? String(r[map.matriculaNome] ?? '').trim() : '';
    const { matricula, nome } = splitMatriculaNome(matriculaNomeRaw);
    const quantidade = map.quantidade >= 0 ? parseNumeroBR(r[map.quantidade]) : 0;
    out.push({ matriculaRaw: matriculaNomeRaw, matricula, nomePlanilha: nome, dataISO, dataRaw, quantidade });
  });
  return out;
}

/** One row of the ADM's editable review table (shared by the planilha and
 * imagem import flows) — built from a parsed row plus the store's own
 * colaboradores, so the table can show the registered apelido (never the
 * planilha/imagem text) and flag a row with no matching colaborador. */
export interface DsmReviewRow {
  key: string;
  matriculaRaw: string;
  matricula: string;
  nomeFonte: string;
  collaboratorId: string | null;
  dataISO: string | null;
  quantidade: number;
}

export function buildDsmReviewRows(parsed: DsmParsedRow[], collaboratorByMatricula: Map<string, { id: string }>): DsmReviewRow[] {
  return parsed.map((p, i) => ({
    key: `${i}-${p.matriculaRaw}-${p.dataRaw}`,
    matriculaRaw: p.matriculaRaw,
    matricula: p.matricula,
    nomeFonte: p.nomePlanilha,
    collaboratorId: p.matricula ? (collaboratorByMatricula.get(p.matricula)?.id ?? null) : null,
    dataISO: p.dataISO,
    quantidade: p.quantidade,
  }));
}
