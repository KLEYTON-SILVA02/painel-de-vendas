// PLANO B (MONITORAMENTO DE LOJAS) — exporta o cadastro de lojas para o
// Monitoramento. Ao contrário de export-catalogo-monitoramento, NÃO é
// filtrado por modelo_catalogo: essa tag existe só para agrupar lojas com
// nomenclatura de produto compatível, não tem relação com "quais lojas o
// Monitoramento pode supervisionar" — a supervisão (lojas cadastradas,
// erros, colaboradores, vendas) é para todas as lojas, sempre. Inclui o
// `id` (uuid interno) porque é a chave que o Monitoramento usa para
// correlacionar esta lista com as de colaboradores/vendas/erros abaixo.
// Somente-leitura; mesma autenticação em duas camadas documentada em
// export-catalogo-monitoramento/index.ts.
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

  const { data: stores, error } = await admin
    .from('stores')
    .select('id, nome_loja, numero_loja, admin_email, created_at, modelo_catalogo');
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ lojas: stores ?? [] }, 200);
});
