import { supabase } from './supabase';

export { translateDbError } from './salesImport';

/** Composite key for the DSM row-level duplicate check — colaborador + dia +
 * quantidade. Unlike sales, a DSM import never *replaces* what's already
 * recorded for a day (every import sums, see 0087_dsm_records.sql): this
 * key only catches the same exact row being imported twice by accident
 * (e.g. the same file uploaded again), never a legitimately different
 * count for the same colaborador/day, which is meant to add a second row. */
export function dsmRecordKey(row: { collaboratorId: string; dataISO: string; quantidade: number }): string {
  return [row.collaboratorId, row.dataISO, row.quantidade].join('|');
}

/** Records one DSM import event (planilha ou imagem) and returns its id,
 * which every dsm_records row inserted in that batch is tagged with via
 * `dsm_records.import_id` — same history pattern as recordSalesImport. */
export async function recordDsmImport(
  storeId: string,
  origem: 'planilha' | 'imagem',
  fileName: string | null,
  rowCount: number,
  duplicateCount: number,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('dsm_imports')
    .insert({ store_id: storeId, origem, file_name: fileName, row_count: rowCount, duplicate_count: duplicateCount })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
}

export interface DsmInsertRow {
  store_id: string;
  collaborator_id: string;
  data: string;
  quantidade: number;
  import_id: string;
}

const INSERT_BATCH_SIZE = 500;

/** Writes `rows` into `dsm_records` in chunks — DSM volumes are far smaller
 * than a sales spreadsheet (dozens to a few hundred rows, not tens of
 * thousands), so this skips the retry/row-level-fallback machinery
 * insertSalesInBatches needs for that scale and just lets a chunk failure
 * propagate (the ADM sees the error and can retry the whole import, which
 * is safe here since dsmRecordKey-based dedup already filtered out
 * anything actually already saved). */
export async function insertDsmRecordsInBatches(rows: DsmInsertRow[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + INSERT_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const { error } = await supabase.from('dsm_records').insert(chunk as never);
    if (error) throw error;
    inserted += chunk.length;
  }
  return inserted;
}
