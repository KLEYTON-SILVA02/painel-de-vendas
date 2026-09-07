// Sets a new password for a collaborator that ALREADY has a login (created
// via grant-collaborator-login). That function only ever creates — it
// explicitly refuses when a profile already exists — so a separate
// service-role operation is needed to overwrite the password on the
// existing auth.users row. No collaborators/profiles row changes: the
// password lives entirely in Supabase Auth, keyed by the profile already
// linked to this collaborator_id.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface ResetLoginBody {
  collaborator_id: string;
  senha: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
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
    return jsonResponse({ error: 'Only an admin can reset a collaborator login' }, 403);
  }
  const storeId = profile.store_id;

  let body: ResetLoginBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const senha = body.senha || '';
  if (!body.collaborator_id || !senha) return jsonResponse({ error: 'collaborator_id and senha are required' }, 400);
  // Mirrors src/lib/passwordPolicy.ts — a client-side check alone is
  // trivially bypassed by calling this function directly.
  if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
    return jsonResponse({ error: 'senha must be at least 8 characters and include both letters and numbers' }, 400);
  }

  // callerClient (not admin) so this naturally stays scoped to the caller's store via RLS.
  const { data: collaborator, error: collabErr } = await callerClient
    .from('collaborators')
    .select('id')
    .eq('id', body.collaborator_id)
    .eq('store_id', storeId)
    .maybeSingle();
  if (collabErr || !collaborator) return jsonResponse({ error: 'Collaborator not found' }, 404);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: existingProfile, error: existingProfileErr } = await admin
    .from('profiles')
    .select('id')
    .eq('collaborator_id', collaborator.id)
    .maybeSingle();
  if (existingProfileErr || !existingProfile) {
    return jsonResponse({ error: 'Este colaborador ainda não tem acesso — use "Criar acesso"' }, 400);
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(existingProfile.id, { password: senha });
  if (updateErr) return jsonResponse({ error: updateErr.message }, 400);

  return jsonResponse({ ok: true }, 200);
});
