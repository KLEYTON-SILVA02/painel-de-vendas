// PLANO B (MONITORAMENTO DE LOJAS) — o item crítico do fluxo de volta:
// disparado por pg_cron (ver migration 0079_apply_monitoramento_correcoes_cron.sql),
// puxa a fila de correções pendentes do Monitoramento e aplica cada uma via
// public.apply_catalog_correction (migration 0078_catalog_correction_pullback.sql),
// que já faz o trabalho pesado (upsert em catalog + retroagir sales.grupo,
// por loja, dentro do grupo de modelo_catalogo certo).
//
// Contrato com o Monitoramento (documentado também no CLAUDE.md deste
// projeto — o outro lado deve implementar exatamente isto quando existir):
//   GET  {MONITORAMENTO_BASE_URL}/correcoes-pendentes
//        header x-monitoramento-secret: <MONITORAMENTO_SYNC_SECRET>
//        -> { "correcoes": [{ "id": "...", "modelo_catalogo": "...", "produto": "...", "categoria": "DERM"|"GEN"|"MP"|"MER" }] }
//   POST {MONITORAMENTO_BASE_URL}/correcoes-processadas
//        header x-monitoramento-secret: <MONITORAMENTO_SYNC_SECRET>
//        body { "ids": ["..."] }
//        -> marca como processadas (idempotente; reprocessar não faz mal,
//           apply_catalog_correction só re-escreve o mesmo valor).
//
// Autenticado igual a send-pending-notifications: pg_cron chama com a anon
// key só para passar pelo verify_jwt da plataforma — a função não confia
// em nada do chamador, só no que ela mesma busca do Monitoramento usando o
// secret. Sem MONITORAMENTO_BASE_URL/MONITORAMENTO_SYNC_SECRET configurados
// (o caso hoje, com o Monitoramento ainda não construído), a função só
// retorna cedo sem fazer nada — seguro deixar o cron agendado e rodando
// desde já.
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface CorrecaoPendente {
  id: string;
  modelo_catalogo: string;
  produto: string;
  categoria: 'DERM' | 'GEN' | 'MP' | 'MER';
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async () => {
  const baseUrl = Deno.env.get('MONITORAMENTO_BASE_URL');
  const secret = Deno.env.get('MONITORAMENTO_SYNC_SECRET');
  if (!baseUrl || !secret) {
    return jsonResponse({ skipped: true, reason: 'MONITORAMENTO_BASE_URL/MONITORAMENTO_SYNC_SECRET não configurados ainda' }, 200);
  }

  const pendentesRes = await fetch(`${baseUrl}/correcoes-pendentes`, {
    headers: { 'x-monitoramento-secret': secret },
  });
  if (!pendentesRes.ok) {
    return jsonResponse({ error: `Falha ao buscar correções pendentes: ${pendentesRes.status}` }, 502);
  }
  const { correcoes } = (await pendentesRes.json()) as { correcoes: CorrecaoPendente[] };
  if (!correcoes || correcoes.length === 0) return jsonResponse({ processadas: 0 }, 200);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const processedIds: string[] = [];
  const falhas: { id: string; error: string }[] = [];

  for (const correcao of correcoes) {
    const { error } = await admin.rpc('apply_catalog_correction', {
      p_modelo_catalogo: correcao.modelo_catalogo,
      p_produto: correcao.produto,
      p_categoria: correcao.categoria,
    });
    if (error) {
      falhas.push({ id: correcao.id, error: error.message });
    } else {
      processedIds.push(correcao.id);
    }
  }

  // Melhor-esforço: se o callback falhar, a próxima rodada só reprocessa —
  // apply_catalog_correction é idempotente (reaplica o mesmo valor).
  if (processedIds.length > 0) {
    await fetch(`${baseUrl}/correcoes-processadas`, {
      method: 'POST',
      headers: { 'x-monitoramento-secret': secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: processedIds }),
    }).catch(() => {});
  }

  return jsonResponse({ processadas: processedIds.length, falhas }, 200);
});
