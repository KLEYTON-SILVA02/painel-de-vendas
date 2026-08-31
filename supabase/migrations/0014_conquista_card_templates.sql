-- Card templates for the Galeria de Conquistas "figurinha" achievement
-- cards. Each row is one admin-created visual template: a final background
-- image (persisted in the `photos` bucket, same convention as
-- uploadPhoto/uploadIcon) plus three mask zones (foto/logo/texto) described
-- as normalized shape+position+scale geometry — never a raster mask, so no
-- reference/guide image the admin used for on-screen alignment is ever
-- persisted here. is_default marks which template the live cards render
-- with; when no row is default, the app falls back to its built-in exact
-- Hiteck template (rendered from bundled assets, not stored in this table).
create table public.conquista_card_templates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  background_url text not null,
  foto jsonb not null,
  logo jsonb not null,
  texto jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.conquista_card_templates enable row level security;

create policy conquista_card_templates_select on public.conquista_card_templates for select
  using (store_id = public.current_store_id());
create policy conquista_card_templates_insert_admin on public.conquista_card_templates for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy conquista_card_templates_update_admin on public.conquista_card_templates for update
  using (public.is_admin() and store_id = public.current_store_id());
create policy conquista_card_templates_delete_admin on public.conquista_card_templates for delete
  using (public.is_admin() and store_id = public.current_store_id());
