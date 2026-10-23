import { supabase } from './supabase';

export { translateDbError } from './salesImport';

export interface ClientServiceReviewRowLike {
  collaboratorId: string | null;
  dataISO: string | null;
  quantidade: number;
}

export interface SaveClientServiceReviewResult {
  count: number;
  unregisteredCount: number;
}

/** Records one "Vendas por Clientes" import event, same history pattern as
 * recordDsmImport/recordSalesImport. */
export async function recordClientServiceImport(storeId: string, fileName: string | null, rowCount: number): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('client_service_imports')
    .insert({ store_id: storeId, file_name: fileName, row_count: rowCount })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
}

const UPSERT_BATCH_SIZE = 500;

/** Grava (upsert) em `client_service_records` — SUBSTITUI, nunca soma, um
 * colaborador/dia já importado (decisão explícita do usuário, pra nunca
 * arriscar inflar o UVC por reimportação). O unique constraint
 * `(store_id, collaborator_id, data)` da migration 0103 faz o
 * `on conflict do update` sobrescrever o valor existente em vez de somar ou
 * duplicar, mesmo quando o novo valor é idêntico ao já salvo.
 *
 * De-duplica por (collaboratorId, dataISO) ANTES de montar os lotes,
 * ficando com a última ocorrência — o ADM pode editar a data de uma linha
 * na tela de revisão até ela colidir com outra do mesmo arquivo, e duas
 * linhas que colidem no mesmo alvo dentro de uma única chamada `upsert`
 * dariam erro no Postgres ("ON CONFLICT DO UPDATE command cannot affect
 * row a second time"). */
export async function saveClientServiceReview(
  storeId: string,
  fileName: string | null,
  rows: ClientServiceReviewRowLike[],
): Promise<SaveClientServiceReviewResult> {
  const candidates = rows.filter(
    (r): r is ClientServiceReviewRowLike & { collaboratorId: string; dataISO: string } => !!r.collaboratorId && !!r.dataISO,
  );
  const unregisteredCount = rows.length - candidates.length;

  const byKey = new Map<string, { collaboratorId: string; dataISO: string; quantidade: number }>();
  candidates.forEach((r) => byKey.set(`${r.collaboratorId}|${r.dataISO}`, r));
  const deduped = Array.from(byKey.values());

  const importRow = await recordClientServiceImport(storeId, fileName, deduped.length);
  const upsertRows = deduped.map((r) => ({
    store_id: storeId,
    collaborator_id: r.collaboratorId,
    data: r.dataISO,
    atendimentos: r.quantidade,
    import_id: importRow.id,
  }));

  let count = 0;
  for (let i = 0; i < upsertRows.length; i += UPSERT_BATCH_SIZE) {
    const chunk = upsertRows.slice(i, i + UPSERT_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const { error } = await supabase.from('client_service_records').upsert(chunk as never, { onConflict: 'store_id,collaborator_id,data' });
    if (error) throw error;
    count += chunk.length;
  }
  return { count, unregisteredCount };
}
