// PLANO B (MONITORAMENTO DE LOJAS) — exporta métricas de injeção de vendas
// por lote (sales_imports: quando, quantas linhas, quantas duplicadas
// descartadas) — nunca a venda em si (produto, valor, vendedor). Serve só
// para o Monitoramento acompanhar o fluxo de dados (loja parou de importar?
// importação anormalmente pequena?), não para nenhuma análise financeira.
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

  const { data: imports, error } = await admin
    .from('sales_imports')
    .select('store_id, row_count, duplicate_count, created_at')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ importacoes: imports ?? [] }, 200);
});
