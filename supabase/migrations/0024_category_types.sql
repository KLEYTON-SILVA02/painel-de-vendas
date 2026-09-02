-- Foundation for a generic "category type" system — lets the ADM create a
-- new partnership category (like BIOSINTÉTICA) with its own name/icon that
-- will carry the same mechanics: own groups/products, sector-restricted
-- ranking eligibility, own scoring. Purely additive: this stage only adds
-- the table and seeds BIOSINTÉTICA as its first row — bio_groups,
-- bio_group_goals and store_settings.bio_weights are untouched here, so
-- nothing in the running app changes yet. Wiring those tables to reference
-- category_types (and building the ADM "criar categoria" screen) is a
-- later stage.
create table public.category_types (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  chave text not null,
  nome text not null,
  icone_url text,
  setores_elegiveis text[] not null default '{}',
  sistema boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, chave)
);
create index category_types_store_idx on public.category_types(store_id);

alter table public.category_types enable row level security;

create policy category_types_select on public.category_types for select
  using (store_id = public.current_store_id());
create policy category_types_insert_admin on public.category_types for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy category_types_update_admin on public.category_types for update
  using (public.is_admin() and store_id = public.current_store_id());
create policy category_types_delete_admin on public.category_types for delete
  using (public.is_admin() and store_id = public.current_store_id());

-- Seed BIOSINTÉTICA as the first (system) category type for every existing
-- store, matching its current hardcoded Balcão-only eligibility.
insert into public.category_types (store_id, chave, nome, setores_elegiveis, sistema)
select id, 'biosintetica', 'Biosintética', array['Balcão'], true
from public.stores
on conflict (store_id, chave) do nothing;
