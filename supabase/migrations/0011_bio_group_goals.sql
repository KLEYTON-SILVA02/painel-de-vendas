-- Biosintética's own G1-G4 meta tiers — deliberately a separate table from
-- `goals` (which holds the general store metas), per the explicit
-- requirement that Biosintética metas never interfere with the general
-- ones. One row per group per store.
create table public.bio_group_goals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  grupo text not null check (grupo in ('G1', 'G2', 'G3', 'G4')),
  meta1 numeric not null default 0,
  meta2 numeric not null default 0,
  meta3 numeric not null default 0,
  unique (store_id, grupo)
);

alter table public.bio_group_goals enable row level security;

create policy bio_group_goals_select on public.bio_group_goals for select
  using (store_id = public.current_store_id());
create policy bio_group_goals_insert_admin on public.bio_group_goals for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy bio_group_goals_update_admin on public.bio_group_goals for update
  using (public.is_admin() and store_id = public.current_store_id());
create policy bio_group_goals_delete_admin on public.bio_group_goals for delete
  using (public.is_admin() and store_id = public.current_store_id());
