// Creates a collaborator's login (matricula+senha), which requires the
// service-role key (auth.admin.createUser) and therefore can't run on the
// client. Only a caller whose own profile has role='admin' may invoke this;
// that check is re-verified server-side against the DB, never trusted from
// the request body.
//
// Synced into the repo from the deployed production source (this function
// existed in Supabase but was never committed here) as part of fixing the
// password-policy gap below — kept at version parity otherwise.
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface CreateCollaboratorBody {
  matricula: string;
  senha: string;
  nome: string;
  apelido?: string | null;
  setor?: string | null;
  meta_individual?: number;
  foto_url?: string | null;
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

  // Scoped to the caller's own JWT: RLS applies, so this can only ever see
  // the caller's own profile row.
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
    return jsonResponse({ error: 'Only an admin can create collaborator logins' }, 403);
  }
  const storeId = profile.store_id;

  let body: CreateCollaboratorBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const matricula = (body.matricula || '').trim();
  const senha = body.senha || '';
  const nome = (body.nome || '').trim();
  if (!matricula || !senha || !nome) {
    return jsonResponse({ error: 'matricula, senha and nome are required' }, 400);
  }
  // Mirrors src/lib/passwordPolicy.ts and the same check in
  // grant-collaborator-login/reset-collaborator-login — this function used to
  // accept any 6-character password with no letter/digit requirement, the
  // weakest of the three collaborator-login entry points for no reason (a
  // client-side check alone is trivially bypassed by calling this function
  // directly).
  if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
    return jsonResponse({ error: 'senha must be at least 8 characters and include both letters and numbers' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const syntheticEmail = `${matricula.toLowerCase()}@${storeId}.colaborador.painel.local`;

  const { data: collaborator, error: collabErr } = await admin
    .from('collaborators')
    .insert({
      store_id: storeId,
      matricula,
      nome,
      apelido: body.apelido ?? null,
      setor: body.setor ?? null,
      meta_individual: body.meta_individual ?? 0,
      foto_url: body.foto_url ?? null,
    })
    .select('id')
    .single();
  if (collabErr || !collaborator) {
    const message = collabErr?.code === '23505' ? 'Matrícula já cadastrada nesta loja' : collabErr?.message;
    return jsonResponse({ error: message ?? 'Failed to create collaborator' }, 400);
  }

  // app_metadata.collaborator_login tells the on_auth_user_created_bind_admin
  // trigger (handle_new_admin_user, migrations 0064/0074) to leave this new
  // auth.users row alone — without it, that trigger treats every new user as
  // a fresh ADM signing up for the first time, creates a phantom store keyed
  // by this synthetic email, and its own profile insert then collides with
  // the one below (duplicate key on profiles_pkey). Only the service role
  // can set app_metadata, so this can't be spoofed from the client.
  const { data: created, error: createUserErr } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password: senha,
    email_confirm: true,
    app_metadata: { collaborator_login: true },
  });
  if (createUserErr || !created.user) {
    await admin.from('collaborators').delete().eq('id', collaborator.id);
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
    await admin.from('collaborators').delete().eq('id', collaborator.id);
    return jsonResponse({ error: profileInsertErr.message }, 400);
  }

  return jsonResponse({ collaborator_id: collaborator.id, user_id: created.user.id }, 200);
});
