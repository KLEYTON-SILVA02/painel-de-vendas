// PLANO B (MONITORAMENTO DE LOJAS) — o único ponto de saída de catálogo
// deste projeto para o Monitoramento de Lojas (projeto Supabase separado,
// ainda não construído). Somente-leitura, puxado pelo Monitoramento
// periodicamente — nunca o inverso. Só devolve linhas de lojas que se
// auto-identificaram com um modelo de catálogo reconhecido (stores.
// modelo_catalogo, ver migration 0076_catalog_shared_model.sql e Minha
// Loja) — lojas sem esse campo preenchido nunca aparecem aqui, permanecem
// tão isoladas quanto sempre foram. Nunca escreve nada; não tem relação
// com o fluxo de correção de categoria (que é o único caminho de volta,
// implementado separadamente, sempre reaproveitando a rotina de
// reclassificação já existente).
//
// Autenticação em duas camadas, mesmo raciocínio já documentado em
// send-pending-notifications/index.ts: o Authorization Bearer só precisa
// ser uma chave válida do projeto (a "anon", pública) para satisfazer o
// verify_jwt da própria plataforma Supabase — não concede nada sozinha. O
// controle de acesso real é o cabeçalho x-monitoramento-secret, comparado
// a um segredo (MONITORAMENTO_SYNC_SECRET) configurado só nas Edge
// Function secrets deste projeto e compartilhado com o Monitoramento por
// fora do código — nunca commitado, nunca em variável de frontend. Esse
// segredo só abre esta leitura agregada; não é uma credencial de banco e
// não aparece em nenhuma policy de RLS.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkMonitoramentoSecret } from '../_shared/monitoramentoAuth.ts';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authError = checkMonitoramentoSecret(req);
  if (authError) return authError;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: stores, error: storesErr } = await admin
    .from('stores')
    .select('id, modelo_catalogo')
    .not('modelo_catalogo', 'is', null);
  if (storesErr) return jsonResponse({ error: storesErr.message }, 500);
  if (!stores || stores.length === 0) return jsonResponse({ produtos: [] }, 200);

  const storeIds = stores.map((s) => s.id);
  const modeloByStoreId = new Map(stores.map((s) => [s.id, s.modelo_catalogo]));

  const { data: catalogRows, error: catalogErr } = await admin
    .from('catalog')
    .select('store_id, nome, categoria')
    .in('store_id', storeIds);
  if (catalogErr) return jsonResponse({ error: catalogErr.message }, 500);

  // Sem preço, sem valor financeiro, sem identificar a loja de origem —
  // só o suficiente para o Monitoramento agrupar por modelo e você
  // classificar em massa dentro de cada grupo compatível.
  const produtos = (catalogRows ?? []).map((row) => ({
    modelo_catalogo: modeloByStoreId.get(row.store_id),
    nome: row.nome,
    categoria: row.categoria,
  }));

  return jsonResponse({ produtos }, 200);
});
