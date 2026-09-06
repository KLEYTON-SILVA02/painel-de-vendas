// Módulo de Notificações — Etapa 1c: entrega via push. A Etapa 1b (pg_cron,
// veja 0039_notifications_dispatch.sql) já decide QUANDO disparar e calcula
// O QUE mandar, gravando uma linha em `notifications` com sent_at ainda
// nulo — essa é a peça que efetivamente empurra isso pro celular via FCM.
// Fica numa Edge Function em vez de dentro do próprio Postgres porque
// autenticar com a API do FCM exige montar e assinar um JWT (RS256) e
// trocar por um access token OAuth2 — bem mais direto em TypeScript/Web
// Crypto do que em PL/pgSQL puro.
//
// Invocada a cada 2 minutos por um job pg_cron + pg_net (ver
// 0040_notifications_dispatch_cron.sql), autenticado com a chave "anon" do
// projeto — pública por natureza (é a mesma que já roda embutida no
// frontend), só serve aqui pra satisfazer o verify_jwt da própria
// plataforma Supabase, não é um controle de acesso real. A função em si só
// processa uma fila que ela mesma já confia (nada vindo do chamador é
// usado), então isso é aceitável.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const MAX_PER_RUN = 200;

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const raw = atob(cleaned);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/** Google's OAuth2-for-service-accounts flow: a self-signed RS256 JWT
 * exchanged at Google's token endpoint for a short-lived access token —
 * see https://developers.google.com/identity/protocols/oauth2/service-account. */
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: FCM_SCOPE,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao obter access token do Google: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}

Deno.serve(async () => {
  const saRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!saRaw) {
    return new Response(JSON.stringify({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON não configurado' }), { status: 500 });
  }
  const sa: ServiceAccount = JSON.parse(saRaw);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: pending, error: pendingErr } = await supabase
    .from('notifications')
    .select('id, collaborator_id, title, body')
    .is('sent_at', null)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);
  if (pendingErr) return new Response(JSON.stringify({ error: pendingErr.message }), { status: 500 });
  if (!pending || pending.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  const accessToken = await getAccessToken(sa);
  const collaboratorIds = [...new Set(pending.map((n) => n.collaborator_id))];
  const { data: tokens } = await supabase.from('push_tokens').select('collaborator_id, token').in('collaborator_id', collaboratorIds);
  const tokensByCollaborator = new Map<string, string[]>();
  for (const t of tokens ?? []) {
    const list = tokensByCollaborator.get(t.collaborator_id) ?? [];
    list.push(t.token);
    tokensByCollaborator.set(t.collaborator_id, list);
  }

  const staleTokens: string[] = [];
  let delivered = 0;

  for (const notification of pending) {
    const deviceTokens = tokensByCollaborator.get(notification.collaborator_id) ?? [];
    for (const token of deviceTokens) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: notification.title, body: notification.body },
          },
        }),
      });
      if (res.ok) {
        delivered++;
      } else if (res.status === 404 || res.status === 400) {
        // Token não existe mais (app desinstalado, reinstalado, etc.) —
        // remove pra não tentar de novo a cada execução.
        staleTokens.push(token);
      }
    }
    // Marca como processada mesmo sem nenhum token registrado ainda —
    // sent_at aqui só controla a fila desta função; o sino do app já mostra
    // a notificação independente de push (ver useNotifications).
    await supabase.from('notifications').update({ sent_at: new Date().toISOString() }).eq('id', notification.id);
  }

  if (staleTokens.length > 0) {
    await supabase.from('push_tokens').delete().in('token', staleTokens);
  }

  return new Response(JSON.stringify({ processed: pending.length, delivered, staleTokensRemoved: staleTokens.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
