// Regex-based reader for the <table:table> section of an ODS
// (OpenDocument Spreadsheet) content.xml.
//
// Why not just use the `xlsx` package (already a dependency, already used
// for the sales import) for this too? Because it has a confirmed bug for
// exactly the shape of report this feature was built around: whenever a
// merged cell's covered remainder is written as a single
// `<table:covered-table-cell table:number-columns-repeated="N">` (N>1) —
// which is exactly how LibreOffice/Excel write the "Matrícula - Nome
// funcionário" merge (1 real cell + N covered columns) in the real DSM
// planilha this was modeled on — SheetJS's ODS reader advances its
// internal column counter by 1 instead of N. Every cell after that point
// in the row silently lands 1+ columns to the left of where it belongs.
// Verified empirically against the sample file: depending on how many
// repeated covered cells a given row has, SheetJS placed the "Data" value
// anywhere from 1 to 3 columns left of where the header row's own "Data"
// label actually is — different rows drift by different amounts, so no
// fixed per-file offset correction is possible. Trusting that output would
// have silently attributed some days' numbers to the wrong date. XLSX/CSV
// don't have this failure mode (OOXML always writes an explicit cell
// reference like r="E2" per cell — there's no repeat-count to
// miscompute), so only the .ods path in DsmImportSection.tsx uses this.
//
// This is intentionally not a general XML parser (no DOMParser dependency,
// which also keeps it testable under Node without a DOM environment) —
// just enough regex-based tokenizing for ODS's table-row/table-cell/
// covered-table-cell/text:p structure, which is narrow and well-defined.
import type { MergeRange } from './dsmImport';

const ROW_RE = /<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g;
const CELL_RE = /<table:(table-cell|covered-table-cell)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:\1>)/g;
const TEXTP_RE = /<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g;

function intAttr(attrs: string, name: string): number | null {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function cellText(content: string | undefined): string {
  if (!content) return '';
  const parts: string[] = [];
  TEXTP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TEXTP_RE.exec(content))) {
    parts.push(decodeEntities(m[1].replace(/<[^>]+>/g, '')));
  }
  return parts.join('\n');
}

export interface OdsTable {
  rows: string[][];
  merges: MergeRange[];
}

// Some ODS writers pad the sheet's declared range with one trailing
// <table:table-row table:number-rows-repeated="1048576"/> (or similar) to
// mark "everything else is empty" — capped instead of materialized in
// full, since this reader only ever needs the populated rows near the top.
const MAX_TRAILING_EMPTY_ROWS = 2000;

/** Parses the first <table:table> found in an ODS content.xml string into
 * a plain row/column grid plus a merges list — same MergeRange shape
 * fillMergedCells (dsmImport.ts) already expects, so the rest of the DSM
 * planilha pipeline (detectDsmHeaderRow/mapDsmColumns/parseDsmRows) works
 * identically regardless of whether the sheet came from this reader or
 * from SheetJS. */
export function parseOdsTable(xml: string): OdsTable {
  const tableMatch = xml.match(/<table:table\b[^>]*>([\s\S]*?)<\/table:table>/);
  const rows: string[][] = [];
  const merges: MergeRange[] = [];
  if (!tableMatch) return { rows, merges };
  const tableXml = tableMatch[1];

  let r = 0;
  ROW_RE.lastIndex = 0;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = ROW_RE.exec(tableXml))) {
    const [, rowAttrs, rowContent] = rowMatch;
    const rowRepeat = Math.min(intAttr(rowAttrs, 'table:number-rows-repeated') ?? 1, MAX_TRAILING_EMPTY_ROWS);

    const rowValues: string[] = [];
    let c = 0;
    CELL_RE.lastIndex = 0;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = CELL_RE.exec(rowContent ?? ''))) {
      const [, tag, cellAttrs, cellContent] = cellMatch;
      const isCovered = tag === 'covered-table-cell';
      const colSpan = intAttr(cellAttrs, 'table:number-columns-spanned') ?? 1;
      const rowSpan = intAttr(cellAttrs, 'table:number-rows-spanned') ?? 1;
      const repeat = intAttr(cellAttrs, 'table:number-columns-repeated') ?? 1;
      const value = isCovered ? '' : cellText(cellContent);
      const startCol = c;
      for (let i = 0; i < repeat; i++) rowValues[c++] = value;
      if (!isCovered && (colSpan > 1 || rowSpan > 1)) {
        merges.push({ s: { r, c: startCol }, e: { r: r + rowSpan - 1, c: startCol + colSpan - 1 } });
      }
    }
    for (let i = 0; i < rowRepeat; i++) {
      rows.push(rowValues.slice());
      r++;
    }
  }
  return { rows, merges };
}
