import { normalize } from './business/normalize';
import { normalizeMatricula } from './business/parsing';
import { supabase } from './supabase';

// Duplicate-prevention for the sales-spreadsheet import (ADM > Importar
// Vendas). Two independent layers:
//   1. File identity — every upload is hashed and recorded in
//      `sales_imports`; re-uploading a file whose hash already exists for
//      this store surfaces a confirm prompt before parsing even starts.
//   2. Row identity — each row's business fields (date/matrícula/produto/
//      código/qtd/valor) are combined into a composite key and checked
//      against both the sales already in the DB and the rows already
//      queued in the current batch, so a duplicate row is silently
//      skipped rather than inserted twice — whether it came from
//      re-uploading the same file, from two files covering overlapping
//      dates, or from a repeated line inside one sheet.

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface SaleImportRow {
  dataISO: string | null;
  matricula: string;
  produto: string;
  codigo: string | null;
  qtd: number;
  valor: number;
}

export function saleImportKey(row: SaleImportRow): string {
  return [row.dataISO ?? '', normalizeMatricula(row.matricula), normalize(row.produto), row.codigo ?? '', row.qtd, row.valor].join('|');
}

export interface SalesImportRecord {
  id: string;
  fileName: string;
  rowCount: number;
  createdAt: string;
}

/** Looks up whether a spreadsheet with this exact content (by file hash)
 * was already imported for this store. */
export async function findExistingImport(storeId: string, fileHash: string): Promise<SalesImportRecord | null> {
  if (!fileHash) return null;
  const { data, error } = await supabase
    .from('sales_imports')
    .select('id, file_name, row_count, created_at')
    .eq('store_id', storeId)
    .eq('file_hash', fileHash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, fileName: data.file_name, rowCount: data.row_count, createdAt: data.created_at };
}

/** Records one import event — the "identificação da planilha" the store
 * can look back on — and returns its id, which every sale row inserted in
 * that batch is tagged with via `sales.import_id`. */
export async function recordSalesImport(
  storeId: string,
  fileName: string,
  fileHash: string,
  rowCount: number,
  duplicateCount: number,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('sales_imports')
    .insert({ store_id: storeId, file_name: fileName, file_hash: fileHash, row_count: rowCount, duplicate_count: duplicateCount })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
}
