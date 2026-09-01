-- REGRA 2: sales data is only kept in full detail for 3 months. Once a
-- month is older than that, only aggregate totals are worth keeping —
-- goals (`goals`/`individual_goals`) already persist independently of
-- `sales`, so they don't need archiving here. The per-product classification
-- for DERM/GEN/MP/MER lives in `sales.grupo` already, but LEVMEL/CHIP and
-- the BIOSINTÉTICA G1-G4 groups are matched against product names at read
-- time (special_lists/bio_group_products keyword lists), not stored — so
-- the aggregation for those categories has to run client-side, reusing the
-- exact same classification engine as the rest of the app, before the raw
-- `sales` rows for the month are deleted.
create table public.sales_archive_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  year_month date not null,
  categoria text not null,
  valor_total numeric not null default 0,
  itens_total numeric not null default 0,
  vendas_total integer not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, year_month, categoria)
);

create table public.sales_archive_collaborators (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  year_month date not null,
  matricula text not null,
  nome text not null,
  valor_total numeric not null default 0,
  itens_total numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, year_month, matricula)
);

create index sales_archive_categories_store_month_idx on public.sales_archive_categories(store_id, year_month);
create index sales_archive_collaborators_store_month_idx on public.sales_archive_collaborators(store_id, year_month);

alter table public.sales_archive_categories enable row level security;
alter table public.sales_archive_collaborators enable row level security;

create policy sales_archive_categories_select on public.sales_archive_categories for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy sales_archive_categories_insert_admin on public.sales_archive_categories for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy sales_archive_categories_update_admin on public.sales_archive_categories for update
  using (public.is_admin() and store_id = public.current_store_id())
  with check (public.is_admin() and store_id = public.current_store_id());

create policy sales_archive_collaborators_select on public.sales_archive_collaborators for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy sales_archive_collaborators_insert_admin on public.sales_archive_collaborators for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy sales_archive_collaborators_update_admin on public.sales_archive_collaborators for update
  using (public.is_admin() and store_id = public.current_store_id())
  with check (public.is_admin() and store_id = public.current_store_id());
