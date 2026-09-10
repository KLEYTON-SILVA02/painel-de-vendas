-- ADM desktop notifications: today, /notificacoes on the desktop shell just
-- reuses the collaborator's own feed verbatim — RLS's `is_admin() OR`
-- clause on notifications_select lets an admin see every collaborator's
-- sale/import notification in the store, which is not what an ADM inbox is
-- for. It also means marking one "read" always no-ops for an admin: the
-- notifications_mark_read policy is `collaborator_id = current_collaborator_id()`
-- with no admin bypass, and current_collaborator_id() is NULL for an admin
-- profile — NULL = NULL is never true in SQL, so the UPDATE matches zero
-- rows and silently succeeds without writing read_at. That's why the
-- unread badge never goes down for an ADM.
--
-- This migration gives notifications a real admin-only concept instead of
-- "every row, because RLS happens to allow it": an `audience` column
-- ('collaborator' | 'admin'), with admin-audience rows carrying no
-- collaborator_id (there isn't one — they're addressed to whoever is
-- signed in as this store's ADM). Two triggers populate that admin feed
-- exactly as requested: a new password_requests row (mobile app "solicitar
-- nova senha") and a new client_error_reports row (uncaught JS
-- errors/promise rejections reported by the client — see
-- src/lib/reportClientError.ts). Both RLS policies get an admin branch so
-- SELECT and mark-as-read actually work for these rows.

alter table public.notifications alter column collaborator_id drop not null;

alter table public.notifications
  add column audience text not null default 'collaborator' check (audience in ('collaborator', 'admin'));

-- Existing rows are all pre-audience collaborator notifications and already
-- have collaborator_id set, so the default backfills them correctly with no
-- further UPDATE needed.

alter table public.notifications
  add constraint notifications_audience_collaborator_chk check (
    (audience = 'collaborator' and collaborator_id is not null)
    or (audience = 'admin' and collaborator_id is null)
  );

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
  using (
    (audience = 'collaborator' and collaborator_id = current_collaborator_id())
    or (audience = 'admin' and is_admin() and store_id = current_store_id())
  );

drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications for update
  using (
    (audience = 'collaborator' and collaborator_id = current_collaborator_id())
    or (audience = 'admin' and is_admin() and store_id = current_store_id())
  )
  with check (
    (audience = 'collaborator' and collaborator_id = current_collaborator_id())
    or (audience = 'admin' and is_admin() and store_id = current_store_id())
  );

-- Password reset requests from the mobile app -> one admin notification
-- per request, so it shows up in the desktop ADM's bell instead of only the
-- separate mobile-admin badge (usePendingPasswordRequests) it already had.
create or replace function public.notify_admin_password_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_matricula text;
begin
  select nome, matricula into v_nome, v_matricula
  from public.collaborators where id = new.collaborator_id;

  insert into public.notifications (store_id, collaborator_id, audience, title, body, data)
  values (
    new.store_id,
    null,
    'admin',
    'Nova solicitação de senha',
    coalesce(v_nome, 'Um colaborador') || ' (matrícula ' || coalesce(v_matricula, '?') || ') solicitou uma nova senha.',
    jsonb_build_object('kind', 'password_request', 'password_request_id', new.id, 'collaborator_id', new.collaborator_id)
  );
  return new;
end;
$$;

drop trigger if exists password_requests_notify_admin on public.password_requests;
create trigger password_requests_notify_admin
  after insert on public.password_requests
  for each row execute function public.notify_admin_password_request();

-- Client-reported browser errors (uncaught exceptions / unhandled promise
-- rejections — see src/lib/reportClientError.ts) -> one admin notification
-- per report, each with its own timestamp via notifications.created_at.
create table public.client_error_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  message text not null,
  stack text,
  url text,
  created_at timestamptz not null default now()
);

alter table public.client_error_reports enable row level security;

-- Any signed-in profile in the store can report an error it hit (collaborator
-- or admin alike) — this is a write-only fire-and-forget channel for them, not
-- something they read back.
create policy client_error_reports_insert on public.client_error_reports
  for insert with check (store_id = current_store_id());

create policy client_error_reports_select_admin on public.client_error_reports
  for select using (is_admin() and store_id = current_store_id());

create or replace function public.notify_admin_client_error()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (store_id, collaborator_id, audience, title, body, data)
  values (
    new.store_id,
    null,
    'admin',
    'Erro detectado no navegador',
    left(new.message, 300),
    jsonb_build_object('kind', 'client_error', 'client_error_report_id', new.id, 'url', new.url)
  );
  return new;
end;
$$;

drop trigger if exists client_error_reports_notify_admin on public.client_error_reports;
create trigger client_error_reports_notify_admin
  after insert on public.client_error_reports
  for each row execute function public.notify_admin_client_error();
