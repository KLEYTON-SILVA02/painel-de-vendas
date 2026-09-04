-- Plano de Ação Tartaruga (performance): Lista de Vendas (ADM > Vendas) used
-- to call useSales() unconditionally on every visit — downloading every sale
-- ever imported for the store just to render collapsed month/day accordion
-- headers, even though most months are never expanded. This RPC gives that
-- screen its header totals (value/items/count per month) from a single
-- aggregate query instead, so the full item-level fetch can become opt-in
-- (see the `salesListEnabled` toggle added to DateRangeContext) without
-- losing the "which month has how much" overview it shows by default.
create or replace function public.sales_month_totals()
returns table(year_month text, valor_total numeric, itens_total numeric, vendas_total bigint)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    to_char(date_trunc('month', s.data_iso), 'YYYY-MM') as year_month,
    sum(s.valor) as valor_total,
    sum(s.qtd) as itens_total,
    count(*) as vendas_total
  from public.sales s
  where s.store_id = public.current_store_id() and public.is_admin()
  group by 1
  order by 1 desc;
$$;

-- Same hardening as 0002_harden_helper_function_grants.sql: no reason for an
-- anonymous caller to invoke this directly. The is_admin() check inside the
-- function body is the real guard against a non-admin authenticated user
-- (this being security definer bypasses sales' own RLS), the grant below
-- just lets a signed-in user call it at all.
revoke execute on function public.sales_month_totals() from public, anon;
grant execute on function public.sales_month_totals() to authenticated;
