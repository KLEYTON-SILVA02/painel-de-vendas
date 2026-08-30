-- Commission % config for Dermocosméticos/Genéricos/Marcas Exclusivas.
-- Mirrors the goals table's shape/RLS pattern (one row per category per
-- store, admin-managed, store-scoped read for both roles).
create table public.commission_rates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  categoria text not null check (categoria in ('DERM', 'GEN', 'MP')),
  percentual numeric not null default 0,
  ativo boolean not null default true,
  unique (store_id, categoria)
);

alter table public.commission_rates enable row level security;

create policy commission_rates_select on public.commission_rates for select
  using (store_id = public.current_store_id());
create policy commission_rates_insert_admin on public.commission_rates for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy commission_rates_update_admin on public.commission_rates for update
  using (public.is_admin() and store_id = public.current_store_id());
create policy commission_rates_delete_admin on public.commission_rates for delete
  using (public.is_admin() and store_id = public.current_store_id());
