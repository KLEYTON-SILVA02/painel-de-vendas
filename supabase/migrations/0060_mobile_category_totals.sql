-- Mobile performance: the mobile category screens (Dermo/Gen-Sim/Marcas
-- Exclusivas, Levmel/Chip, Mercadoria Geral, Ranking) used to call useSales()
-- unconditionally just like desktop, downloading every item-level sale ever
-- imported for the store to compute per-collaborator totals client-side —
-- the actual cause of mobile slowness/travamento, since a phone has to hold
-- and reduce that entire history just to show a handful of aggregate rows.
--
-- This RPC returns only what those screens actually render: totals per
-- (matricula, categoria) for a date range, aggregated server-side. No
-- duplicated/synced table — it reads straight from the live `sales` table
-- (same live-aggregation pattern as sales_month_totals()), so there's no new
-- staleness surface to keep in sync on every sale mutation site.
--
-- `categoria` mirrors the overlapping-tag model computeSummary()/
-- archive_old_sales_for_store() already use: a sale can land in more than
-- one bucket (e.g. a DERM sale that also matches the LEVMEL keyword list),
-- plus a catch-all 'ALL' every sale always counts toward (Mercadoria Geral's
-- catFilter='ALL' grand total). Item-level detail (Lista de Vendas) keeps
-- reading full `sales` unchanged — this only replaces the aggregate path.
create or replace function public.mobile_category_totals(from_iso date, to_iso date)
returns table(matricula text, categoria text, valor_total numeric, itens_total numeric)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with levmel_kw as (
    select coalesce(array_agg(kw), '{}') as kws
    from public.special_lists sl,
      lateral unnest(case when coalesce(array_length(sl.palavras, 1), 0) > 0 then sl.palavras else array[sl.nome] end) as kw
    where sl.store_id = public.current_store_id() and sl.tipo = 'levmel'
  ),
  chip_kw as (
    select coalesce(array_agg(kw), '{}') as kws
    from public.special_lists sl,
      lateral unnest(case when coalesce(array_length(sl.palavras, 1), 0) > 0 then sl.palavras else array[sl.nome] end) as kw
    where sl.store_id = public.current_store_id() and sl.tipo = 'chip'
  ),
  tagged as (
    select
      s.matricula,
      s.valor,
      s.qtd,
      unnest(array_remove(array[
        case when s.grupo in ('DERM', 'GEN', 'MP', 'MER') then s.grupo end,
        case when public.matches_special_list(s.produto, (select kws from levmel_kw)) then 'LEVMEL' end,
        case when public.matches_special_list(s.produto, (select kws from chip_kw)) then 'CHIP' end,
        'ALL'
      ], null)) as categoria
    from public.sales s
    where s.store_id = public.current_store_id()
      and public.is_admin()
      and s.data_iso >= from_iso and s.data_iso <= to_iso
  )
  select matricula, categoria, sum(valor) as valor_total, sum(qtd) as itens_total
  from tagged
  group by matricula, categoria;
$$;

-- Same hardening as sales_month_totals(): is_admin() inside the function
-- body is the real guard (this being security definer bypasses sales' own
-- RLS), the grant below just lets a signed-in user call it at all.
revoke execute on function public.mobile_category_totals(date, date) from public, anon;
grant execute on function public.mobile_category_totals(date, date) to authenticated;
