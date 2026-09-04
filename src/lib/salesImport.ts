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

/** Writes the live progress + diagnostic counters onto the import row as
 * the batch runs, instead of only holding them in React state — so the
 * numbers survive a tab switch or reload instead of resetting to "no
 * import in progress" the moment the screen unmounts mid-import. Errors
 * here are swallowed: it's a nice-to-have status readout, not something
 * that should abort an otherwise-successful import. */
export async function updateSalesImportProgress(
  importId: string,
  patch: Partial<{
    insertedRows: number;
    invalidDateCount: number;
    unmatchedSellerCount: number;
    unclassifiedCount: number;
    processingMs: number;
  }>,
): Promise<void> {
  try {
    await supabase
      .from('sales_imports')
      .update({
        ...(patch.insertedRows !== undefined && { inserted_rows: patch.insertedRows }),
        ...(patch.invalidDateCount !== undefined && { invalid_date_count: patch.invalidDateCount }),
        ...(patch.unmatchedSellerCount !== undefined && { unmatched_seller_count: patch.unmatchedSellerCount }),
        ...(patch.unclassifiedCount !== undefined && { unclassified_count: patch.unclassifiedCount }),
        ...(patch.processingMs !== undefined && { processing_ms: patch.processingMs }),
      })
      .eq('id', importId);
  } catch {
    // best-effort — see comment above
  }
}

// ---- Duplicate-prevention layer 3: per-date aggregate comparison ----
//
// Layers 1 (file hash) and 2 (per-row composite key) above catch "the exact
// same file" and "the exact same row" respectively, but neither protects
// against a spreadsheet that's a genuine but *incomplete* resend for a date
// already imported (e.g. someone re-exports "today's sales" mid-day and it
// has fewer rows than the version already in the system from later in the
// day) — that would just silently add a partial second copy of the day
// under row-level dedup, undercounting nothing but also not fixing
// anything. This layer runs before any row is written: it compares, per
// date, what the incoming file has against what's already recorded for
// that date in this store, and classifies the date so the caller can
// block a short/partial resend outright rather than import it.

export interface DateAggregate {
  count: number;
  total: number;
}

/** Groups rows by ISO date, summing row count and value per date. */
export function aggregateByDate<T extends { dataISO: string | null; valor: number }>(rows: T[]): Map<string, DateAggregate> {
  const map = new Map<string, DateAggregate>();
  rows.forEach((r) => {
    if (!r.dataISO) return;
    const agg = map.get(r.dataISO) ?? { count: 0, total: 0 };
    agg.count += 1;
    agg.total += r.valor;
    map.set(r.dataISO, agg);
  });
  return map;
}

const VALOR_TOLERANCE = 0.01;

export type DateComparison = 'new' | 'replace' | 'blocked';

/** Classifies one date's incoming aggregate against what's already
 * recorded for it: nothing recorded yet → 'new' (imports straight
 * through); incoming has at least as many rows and at least as much value
 * (R$0,01 tolerance) → 'replace' (a full resend — offered as a
 * delete-and-rewrite so the same file can be re-uploaded without creating
 * duplicates); anything short of the existing data on either dimension →
 * 'blocked' (a partial resend that would silently undercount the day). */
export function compareDateAggregate(incoming: DateAggregate, existing: DateAggregate | undefined): DateComparison {
  if (!existing || existing.count === 0) return 'new';
  if (incoming.count >= existing.count && incoming.total >= existing.total - VALOR_TOLERANCE) return 'replace';
  return 'blocked';
}

const DATE_EXCLUSION_CHUNK = 20;

/** Deletes every sale for this store on the given dates, in chunks — the
 * "apaga somente aquelas datas e regrava" half of a confirmed full resend.
 * Only ever called for dates the caller already classified 'replace'. */
export async function deleteSalesForDates(storeId: string, dates: string[]): Promise<void> {
  for (let i = 0; i < dates.length; i += DATE_EXCLUSION_CHUNK) {
    const chunk = dates.slice(i, i + DATE_EXCLUSION_CHUNK);
    // eslint-disable-next-line no-await-in-loop
    const { error } = await supabase.from('sales').delete().eq('store_id', storeId).in('data_iso', chunk);
    if (error) throw error;
  }
}

// ---- Friendly error messages ----

/** Translates a raw Postgres/PostgREST error (surfaced as-is by default —
 * "new row violates row-level security policy for table..." — into
 * something an ADM can actually act on, matching the common cases a sales
 * import can hit: no permission, a duplicate the DB itself rejected (belt
 * and suspenders past the app's own dedup), a dangling reference, a
 * missing required field, or an expired session. Falls back to the
 * original message for anything else rather than hiding it. */
export function translateDbError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  const message = err instanceof Error ? err.message : String(err);
  switch (code) {
    case '42501':
      return 'Sem permissão para gravar vendas nesta loja. Verifique se sua sessão de ADM ainda está ativa.';
    case '23505':
      return 'O banco rejeitou uma venda por duplicidade (registro idêntico já existente).';
    case '23503':
      return 'Uma das linhas referencia um cadastro que não existe (ex.: loja inválida).';
    case '23502':
      return 'Uma das linhas está sem um campo obrigatório.';
    case 'PGRST301':
    case '401':
      return 'Sua sessão expirou. Faça login novamente e repita a importação.';
    default:
      if (/JWT|session/i.test(message)) return 'Sua sessão expirou. Faça login novamente e repita a importação.';
      return message || 'Falha ao gravar vendas.';
  }
}

// ---- Batched insert with retry + row-level fallback ----

const INSERT_BATCH_SIZE = 500;
const MAX_ATTEMPTS = 3;
const BATCH_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RejectedRow {
  row: Record<string, unknown>;
  error: string;
}

export interface InsertBatchesResult {
  insertedCount: number;
  rejected: RejectedRow[];
}

/** Writes `rows` into `sales` in chunks, same as before, but a chunk that
 * fails (network blip, transient DB error) now gets retried up to 3 times
 * (each attempt capped at 30s) instead of aborting the whole import on the
 * first failure. If every attempt for a chunk still fails, it falls back
 * to inserting that chunk one row at a time — isolating whichever specific
 * row(s) are actually the problem into a rejected list, rather than losing
 * the rest of an otherwise-good chunk along with them. `onProgress` is
 * called after every chunk (successful or not) with the running total. */
export async function insertSalesInBatches(
  rows: Record<string, unknown>[],
  onProgress: (inserted: number, total: number) => void,
): Promise<InsertBatchesResult> {
  let insertedCount = 0;
  const rejected: RejectedRow[] = [];

  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + INSERT_BATCH_SIZE);
    let ok = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const { error } = await supabase
          .from('sales')
          .insert(chunk as never)
          .abortSignal(AbortSignal.timeout(BATCH_TIMEOUT_MS));
        if (error) throw error;
        ok = true;
        insertedCount += chunk.length;
      } catch {
        if (attempt < MAX_ATTEMPTS) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(500 * attempt);
          continue;
        }
        // Final attempt for this chunk failed — isolate the problem
        // row(s) instead of losing the whole chunk.
        for (const row of chunk) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const { error: rowErr } = await supabase.from('sales').insert(row as never);
            if (rowErr) throw rowErr;
            insertedCount += 1;
          } catch (rowCatchErr) {
            rejected.push({ row, error: translateDbError(rowCatchErr) });
          }
        }
      }
    }
    onProgress(insertedCount, rows.length);
  }
  return { insertedCount, rejected };
}
