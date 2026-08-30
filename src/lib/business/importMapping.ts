// Ported 1:1 from legacy/index-original.html (detectHeaderRow / autoMapColumns).
import { normalize } from './normalize';

export type ImportField = 'data' | 'matricula' | 'vendedor' | 'codigo' | 'produto' | 'qtd' | 'valor';

export const HEADER_TERMS = [
  'data', 'matricula', 'matrícula', 'vendedor', 'colaborador', 'produto', 'qtd', 'quant', 'valor', 'total',
];

export const FIELD_NAMES: Record<ImportField, string[]> = {
  data: ['data'],
  matricula: ['matricula', 'matrícula'],
  vendedor: ['vendedor nome', 'colaborador', 'nome do vendedor', 'vendedor'],
  codigo: ['codigo do produto', 'código do produto', 'codigo produto', 'cod produto'],
  produto: ['descricao do produto', 'descrição do produto', 'descricao', 'produto', 'descricao produto'],
  qtd: ['quantidade vendida', 'quantidade', 'qtd', 'quant'],
  valor: ['valor do produto', 'valor', 'total', 'valor total'],
};

// Fallback column indices for the store's known fixed spreadsheet layout
// (A=Data, B=GO, C=GR, D=Filial, E=Filial Nome, F=PDV, G=Vendedor[código],
// H=Vendedor Nome, I=Matrícula, J=Código do Produto, K=Descrição do Produto,
// L=Quantidade Vendida, M=Valor do Produto), used only when a field can't be
// matched by header name.
export const FIXED_COLS: Partial<Record<ImportField, number>> = {
  data: 0, matricula: 8, vendedor: 7, codigo: 9, produto: 10, qtd: 11, valor: 12,
};

/** Scans the first 15 rows for a header row: the first one hitting >=2 known terms. */
export function detectHeaderRow(rows: unknown[][]): number {
  const scan = Math.min(15, rows.length);
  for (let i = 0; i < scan; i++) {
    const row = rows[i].map((c) => normalize(c as string));
    const hits = HEADER_TERMS.filter((t) => row.some((cell) => cell.includes(normalize(t))));
    if (hits.length >= 2) return i;
  }
  return 0;
}

export type ColumnMap = Record<ImportField, number>;

/** Auto-maps spreadsheet headers to import fields: exact name match, then
 * substring match, then the store's fixed column layout as last resort. */
export function autoMapColumns(headers: unknown[]): ColumnMap {
  const norm = headers.map((h) => normalize(h as string));
  const map = {} as ColumnMap;
  (Object.keys(FIELD_NAMES) as ImportField[]).forEach((field) => {
    const names = FIELD_NAMES[field];
    let idx = norm.findIndex((h) => names.some((n) => h === normalize(n)));
    if (idx < 0) idx = norm.findIndex((h) => names.some((n) => h.includes(normalize(n))));
    if (idx < 0) idx = FIXED_COLS[field] !== undefined ? FIXED_COLS[field]! : -1;
    map[field] = idx;
  });
  return map;
}
