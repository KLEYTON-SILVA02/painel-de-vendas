-- Fixes the "mobile loading takes 5+ minutes and doesn't open" regression
-- introduced by PR #226 (which made MobileInicioPage.tsx and
-- MetasVendasPage.tsx call mobile_category_totals() unconditionally on
-- every mobile app open, MetasVendasPage.tsx even twice).
--
-- Root cause: mobile_category_totals() called public.matches_special_list()
-- twice per sales row (LEVMEL + CHIP tagging) inside a per-row ProjectSet.
-- matches_special_list()'s body is itself an EXISTS(...) subquery, and
-- Postgres does not inline SQL functions whose body contains a nested
-- subquery (confirmed empirically via EXPLAIN on a minimal repro, with and
-- without the function's SET search_path clause — inlining never happened
-- either way) — so every call runs as its own separate function execution
-- instead of folding into the outer plan. On a busy store's monthly range
-- (~22k sales rows) this measured 3.8-8s of pure execution time per call in
-- production, which turned into a multi-second-to-multi-minute hang once
-- both landing screens started firing it on every cold app open.
--
-- Fix: inline the same LEVMEL/CHIP matching logic directly into this
-- function's own tagged CTE instead of going through the function boundary.
-- Verified via EXPLAIN ANALYZE against production data: ~0.4s for a single
-- month on the busiest store (vs 3.8-8s before), ~2s for that store's entire
-- sales history (vs the old per-call cost for just one month). Output is
-- identical; only the internal evaluation strategy changed.
--
-- matches_special_list()/normalize_text() themselves are left untouched —
-- they're still used by lower-volume paths (sales/import notification
-- dispatch, sales archival) where this per-call overhead doesn't compound
-- into a user-facing hang.
create or replace function public.mobile_category_totals(from_iso date, to_iso date)
returns table(matricula text, categoria text, valor_total numeric, itens_total numeric)
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
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
        case when exists (
          select 1 from unnest((select kws from levmel_kw)) as kw
          where lower(trim(extensions.unaccent(kw))) <> ''
            and position(lower(trim(extensions.unaccent(kw))) in lower(trim(extensions.unaccent(s.produto)))) > 0
        ) then 'LEVMEL' end,
        case when exists (
          select 1 from unnest((select kws from chip_kw)) as kw
          where lower(trim(extensions.unaccent(kw))) <> ''
            and position(lower(trim(extensions.unaccent(kw))) in lower(trim(extensions.unaccent(s.produto)))) > 0
        ) then 'CHIP' end,
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
$function$;
