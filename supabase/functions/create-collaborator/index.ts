// Creates a collaborator's login (matricula+senha), which requires the
// service-role key (auth.admin.createUser) and therefore can't run on the
// client. Only a caller whose own profile has role='admin' may invoke this;
// that check is re-verified server-side against the DB, never trusted from
// the request body.
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
  if (senha.length < 6) {
    return jsonResponse({ error: 'senha must be at least 6 characters' }, 400);
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

  const { data: created, error: createUserErr } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password: senha,
    email_confirm: true,
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
