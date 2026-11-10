// Auditoria de segurança (item 6): as Edge Functions internas chamadas só pelo
// pg_cron (send-pending-notifications, apply-monitoramento-correcoes) checavam só o
// JWT da própria plataforma Supabase — satisfeito por qualquer chamada com a chave
// "anon" pública, que já roda embutida no frontend. Este segredo próprio é o controle
// real: comparado contra a env var CRON_SECRET (Edge Function secret, nunca enviada
// ao navegador), mesmo raciocínio de duas camadas de monitoramentoAuth.ts.
//
// Enquanto CRON_SECRET não estiver cadastrada, a checagem fica desligada (mesmo
// comportamento de antes): recusar tudo nesse estado derrubaria o próprio pg_cron e,
// com ele, as notificações push. A proteção passa a valer no momento do cadastro.
export function checkCronSecret(req: Request): Response | null {
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected) {
    console.warn('CRON_SECRET não configurado — checagem de x-cron-secret desligada');
    return null;
  }
  if (req.headers.get('x-cron-secret') !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
