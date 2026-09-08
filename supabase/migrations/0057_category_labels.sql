-- Per-store display-name overrides for the 6 fixed categories
-- (DERM/GEN/MP/MER/LEVMEL/CHIP). category_key is a free string (not an
-- enum/FK) mirroring function_icons' function_key convention, so no schema
-- change is needed if a 7th fixed slot is ever introduced. A missing row
-- for a given key means "use the built-in default label" — this table only
-- ever holds overrides, never a full mandatory set.
create table public.category_labels (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_key text not null,
  label text not null,
  unique (store_id, category_key)
);

alter table public.category_labels enable row level security;

create policy category_labels_select on public.category_labels for select
  using (store_id = public.current_store_id());
create policy category_labels_insert_admin on public.category_labels for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy category_labels_update_admin on public.category_labels for update
  using (public.is_admin() and store_id = public.current_store_id());
create policy category_labels_delete_admin on public.category_labels for delete
  using (public.is_admin() and store_id = public.current_store_id());
