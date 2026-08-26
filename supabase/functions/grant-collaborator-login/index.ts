// Grants a matricula+senha login to an ALREADY-EXISTING collaborator record
// (the normal "add collaborator" flow never creates a login — that mirrors
// the legacy system, where collaborators are just records). This is the
// opt-in action for provisioning access, kept separate from
// create-collaborator so plain roster management never requires a password.
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface GrantLoginBody {
  collaborator_id: string;
  senha: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: 'Invalid session' }, 401);

  const { data: profile, error: profileErr } = await callerClient
    .from('profiles')
    .select('role, store_id')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileErr || !profile || profile.role !== 'admin') {
    return jsonResponse({ error: 'Only an admin can grant collaborator logins' }, 403);
  }
  const storeId = profile.store_id;

  let body: GrantLoginBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const senha = body.senha || '';
  if (!body.collaborator_id || !senha) return jsonResponse({ error: 'collaborator_id and senha are required' }, 400);
  if (senha.length < 6) return jsonResponse({ error: 'senha must be at least 6 characters' }, 400);

  // callerClient (not admin) so this naturally stays scoped to the caller's store via RLS.
  const { data: collaborator, error: collabErr } = await callerClient
    .from('collaborators')
    .select('id, matricula')
    .eq('id', body.collaborator_id)
    .maybeSingle();
  if (collabErr || !collaborator) return jsonResponse({ error: 'Collaborator not found' }, 404);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('collaborator_id', collaborator.id)
    .maybeSingle();
  if (existingProfile) return jsonResponse({ error: 'Este colaborador já tem acesso' }, 400);

  const syntheticEmail = `${collaborator.matricula.toLowerCase()}@${storeId}.colaborador.painel.local`;

  const { data: created, error: createUserErr } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password: senha,
    email_confirm: true,
  });
  if (createUserErr || !created.user) {
    return jsonResponse({ error: createUserErr?.message ?? 'Failed to create login' }, 400);
  }

  const { error: profileInsertErr } = await admin.from('profiles').insert({
    id: created.user.id,
    store_id: storeId,
    role: 'collaborator',
    collaborator_id: collaborator.id,
  });
  if (profileInsertErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: profileInsertErr.message }, 400);
  }

  return jsonResponse({ user_id: created.user.id }, 200);
});
