-- Per-store overrides for which spreadsheet header names the sales-import
-- flow recognizes for each field (data/matricula/vendedor/codigo/produto/
-- qtd/valor). `terms` holds the store's own candidate header names for
-- that field, tried in priority order (same semantics as the built-in
-- FIELD_NAMES map in src/lib/business/importMapping.ts) before falling
-- back to the built-in defaults. A missing row for a field means "use the
-- built-in defaults for that field" — same override-only convention as
-- category_labels/function_icons.
create table public.import_field_overrides (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  field text not null,
  terms text[] not null default '{}',
  unique (store_id, field)
);

alter table public.import_field_overrides enable row level security;

create policy import_field_overrides_select on public.import_field_overrides for select
  using (store_id = public.current_store_id());
create policy import_field_overrides_insert_admin on public.import_field_overrides for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy import_field_overrides_update_admin on public.import_field_overrides for update
  using (public.is_admin() and store_id = public.current_store_id());
create policy import_field_overrides_delete_admin on public.import_field_overrides for delete
  using (public.is_admin() and store_id = public.current_store_id());
