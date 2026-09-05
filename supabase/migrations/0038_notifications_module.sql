-- Módulo de Notificações — Etapa 1 (fundação): histórico de notificações
-- in-app, agenda de disparos configurada pelo ADM, e tokens de push por
-- colaborador. Ainda não envia nada sozinho — isso vem na Etapa 1b (função
-- agendada via pg_cron, no mesmo padrão de 0034_archive_old_sales_cron.sql)
-- assim que a integração com o provedor de push (Firebase Cloud Messaging)
-- estiver configurada.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  title text not null,
  body text not null,
  -- Payload estruturado (ex: valores por categoria) para a tela de
  -- notificações no app renderizar além do texto simples, sem precisar
  -- reprocessar nada.
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- Preenchido pela função de envio (Etapa 1b) quando a mensagem realmente
  -- sai via push — nulo até lá, o que também serve de fila "pendente de
  -- envio" pra essa função processar.
  sent_at timestamptz
);
create index notifications_collaborator_idx on public.notifications (collaborator_id, created_at desc);
create index notifications_pending_send_idx on public.notifications (created_at) where sent_at is null;

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select
  using (collaborator_id = public.current_collaborator_id() or (public.is_admin() and store_id = public.current_store_id()));
-- Colaborador só marca como lida a própria notificação — nunca cria ou
-- edita título/corpo (isso é papel exclusivo da função de disparo).
create policy notifications_mark_read on public.notifications for update
  using (collaborator_id = public.current_collaborator_id())
  with check (collaborator_id = public.current_collaborator_id());

create table public.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  hora time not null,
  -- Mesmas chaves de dia da semana já usadas em store_settings.horario
  -- (src/lib/business/horario.ts) — reaproveita a convenção existente em
  -- vez de inventar outra.
  dias jsonb not null default '["seg","ter","qua","qui","sex","sab","dom"]'::jsonb,
  ativo boolean not null default true,
  -- Data do último disparo já realizado por este agendamento — evita
  -- disparo duplicado quando a função de cron roda a cada poucos minutos
  -- e o horário configurado cai dentro de mais de uma execução.
  last_sent_date date,
  created_at timestamptz not null default now()
);
create index notification_schedules_store_idx on public.notification_schedules (store_id);

alter table public.notification_schedules enable row level security;
create policy notification_schedules_select_admin on public.notification_schedules for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy notification_schedules_insert_admin on public.notification_schedules for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy notification_schedules_update_admin on public.notification_schedules for update
  using (public.is_admin() and store_id = public.current_store_id());
create policy notification_schedules_delete_admin on public.notification_schedules for delete
  using (public.is_admin() and store_id = public.current_store_id());

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  token text not null unique,
  -- 'web' cobre tanto o navegador quanto o PWA instalado hoje; 'android'/
  -- 'ios' passam a existir quando o app for empacotado com Capacitor
  -- (Etapa 2) e registrar o token nativo do FCM/APNs em vez do VAPID web.
  platform text not null check (platform in ('web', 'android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_collaborator_idx on public.push_tokens (collaborator_id);

alter table public.push_tokens enable row level security;
create policy push_tokens_manage_own on public.push_tokens for all
  using (collaborator_id = public.current_collaborator_id())
  with check (collaborator_id = public.current_collaborator_id());
