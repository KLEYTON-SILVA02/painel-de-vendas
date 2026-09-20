// Shared secret check for every read-only export endpoint the future
// Monitoramento de Lojas project pulls from (export-catalogo-monitoramento,
// export-lojas-monitoramento, export-colaboradores-monitoramento,
// export-vendas-monitoramento, export-erros-monitoramento). Same two-layer
// reasoning already documented in send-pending-notifications/index.ts: the
// caller's Authorization Bearer only needs to be a valid project key (the
// public anon key is fine) to satisfy Supabase's own platform verify_jwt
// gate — the real access control is this header, compared against
// MONITORAMENTO_SYNC_SECRET (an Edge Function secret, never shipped to the
// frontend, shared with the Monitoramento project out of band once it
// exists). One secret for every export function — they're all equally
// scoped to "read-only aggregated export", so splitting it per function
// would add rotation friction without adding real isolation.
export function checkMonitoramentoSecret(req: Request): Response | null {
  const expected = Deno.env.get('MONITORAMENTO_SYNC_SECRET');
  const provided = req.headers.get('x-monitoramento-secret');
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
