// PLANO B (MONITORAMENTO DE LOJAS) — exporta client_error_reports agregado
// entre lojas (hoje só alimenta o sino de notificação do próprio ADM da
// loja, isolado por store_id). Sem profile_id: quem gerou o erro não
// importa para o Monitoramento, só o erro em si. Limitado aos últimos 30
// dias para manter o payload previsível — erros antigos não são acionáveis.
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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: erros, error } = await admin
    .from('client_error_reports')
    .select('store_id, message, stack, url, created_at')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ erros: erros ?? [] }, 200);
});
