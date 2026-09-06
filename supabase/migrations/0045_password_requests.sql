-- Reverse-direction notification: a collaborator "esqueceu a senha" and
-- wants the ADM to generate a new one (see reset-collaborator-login,
-- migration 0-desktop-batch). `notifications` only ever flows admin ->
-- collaborator (no `from`/direction column, RLS assumes admin authorship),
-- so this is a dedicated table instead of overloading that one.
create table public.password_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'atendido')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index password_requests_store_status_idx on public.password_requests (store_id, status);

alter table public.password_requests enable row level security;

-- Admin: full visibility + can mark a request atendido once a new senha was
-- generated (via ColaboradoresPage's "Gerar nova senha").
create policy password_requests_select_admin on public.password_requests for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy password_requests_update_admin on public.password_requests for update
  using (public.is_admin() and store_id = public.current_store_id());

-- Collaborator: can see and create only their own requests (e.g. to avoid
-- firing a duplicate while one is still pendente).
create policy password_requests_select_self on public.password_requests for select
  using (collaborator_id = public.current_collaborator_id());
create policy password_requests_insert_self on public.password_requests for insert
  with check (store_id = public.current_store_id() and collaborator_id = public.current_collaborator_id());
