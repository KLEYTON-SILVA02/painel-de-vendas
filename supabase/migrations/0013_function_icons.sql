-- Custom SVG icon overrides per function/screen. function_key is a free
-- string (not a fixed enum) so new functions can register an icon slot
-- later without a schema change. icon_url points into the existing
-- `photos` storage bucket (same bucket reused, not a new one) under
-- {store_id}/icons/{function_key}.svg — read by every signed-in user,
-- written only by admins of that store.
create table public.function_icons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  function_key text not null,
  icon_url text,
  unique (store_id, function_key)
);

alter table public.function_icons enable row level security;

create policy function_icons_select on public.function_icons for select
  using (store_id = public.current_store_id());
create policy function_icons_insert_admin on public.function_icons for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy function_icons_update_admin on public.function_icons for update
  using (public.is_admin() and store_id = public.current_store_id());
create policy function_icons_delete_admin on public.function_icons for delete
  using (public.is_admin() and store_id = public.current_store_id());
