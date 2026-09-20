// PLANO B (MONITORAMENTO DE LOJAS) — exporta contagens de colaboradores por
// loja/setor, nunca um colaborador individual. "com_login" conta quem tem
// um profiles.collaborator_id apontando para ele (ou seja, já recebeu
// acesso via grant-collaborator-login) — nunca a senha em si, que não é
// legível em lugar nenhum (Supabase Auth só guarda hash). Este schema não
// tem um conceito de colaborador "inativo"/soft-delete hoje — toda linha em
// `collaborators` é considerada presente no quadro atual da loja.
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

  const { data: collaborators, error: collabErr } = await admin
    .from('collaborators')
    .select('id, store_id, setor');
  if (collabErr) return jsonResponse({ error: collabErr.message }, 500);

  const { data: profiles, error: profilesErr } = await admin
    .from('profiles')
    .select('collaborator_id')
    .not('collaborator_id', 'is', null);
  if (profilesErr) return jsonResponse({ error: profilesErr.message }, 500);

  const withLogin = new Set((profiles ?? []).map((p) => p.collaborator_id));

  const counts = new Map<string, { store_id: string; setor: string | null; total: number; com_login: number }>();
  for (const c of collaborators ?? []) {
    const key = `${c.store_id}::${c.setor ?? ''}`;
    const entry = counts.get(key) ?? { store_id: c.store_id, setor: c.setor, total: 0, com_login: 0 };
    entry.total += 1;
    if (withLogin.has(c.id)) entry.com_login += 1;
    counts.set(key, entry);
  }

  return jsonResponse({ colaboradores: Array.from(counts.values()) }, 200);
});
