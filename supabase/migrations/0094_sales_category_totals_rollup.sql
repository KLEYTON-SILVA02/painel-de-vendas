-- Pre-aggregated rollup for mobile_category_totals(): instead of re-scanning
-- and re-tagging every sales row in the requested range on EVERY mobile
-- screen open (Início, Metas/Vendas — the highest-traffic mobile screens),
-- keep a small per-day/per-collaborator/per-category summary table that's
-- updated incrementally whenever `sales` changes (import, reclassification,
-- manual edit/delete), and have the RPC just sum that instead. This is the
-- "cofre de totais" discussed with the user: the mobile app's day-to-day
-- traffic only ever touches this tiny summary table, never the full sales
-- history — which is what makes it hold up under many concurrent users
-- instead of degrading as historical sales volume grows.
--
-- Scope: only DERM/GEN/MP/MER/ALL — the four fixed sales categories plus the
-- grand total. LEVMEL/CHIP are deliberately NOT part of this rollup: they're
-- not a property of a sale row itself but a live keyword match against
-- store_settings' special_lists (which can change at any time), so caching
-- them here would silently go stale whenever an ADM edits those keyword
-- lists. They stay computed live in the RPC below, using the same inlined
-- (fast, see migration 0093) technique — LEVMEL/CHIP have their own
-- dedicated, far lower-traffic screens, so this doesn't reintroduce the
-- original performance problem.
create table public.sales_category_totals_daily (
  store_id uuid not null references public.stores(id) on delete cascade,
  data_iso date not null,
  matricula text not null,
  categoria text not null check (categoria in ('DERM', 'GEN', 'MP', 'MER', 'ALL')),
  valor_total numeric not null default 0,
  itens_total numeric not null default 0,
  primary key (store_id, data_iso, matricula, categoria)
);

create index sales_category_totals_daily_store_data_idx on public.sales_category_totals_daily (store_id, data_iso);

alter table public.sales_category_totals_daily enable row level security;

-- Same access rule as `sales` itself (sales_select) — any authenticated
-- member of the store, admin or collaborator, can read the store's own
-- aggregate totals. This table is never written to directly by the app
-- (see the SECURITY DEFINER trigger function below) — RLS deliberately
-- exposes no insert/update/delete policy for it.
create policy sales_category_totals_daily_select on public.sales_category_totals_daily
  for select using (store_id = public.current_store_id());

-- One-time backfill from existing sales history.
insert into public.sales_category_totals_daily (store_id, data_iso, matricula, categoria, valor_total, itens_total)
select s.store_id, s.data_iso, s.matricula, categoria, sum(s.valor), sum(s.qtd)
from public.sales s,
  lateral unnest(array_remove(array[
    case when s.grupo in ('DERM', 'GEN', 'MP', 'MER') then s.grupo end,
    'ALL'
  ], null)) as categoria
group by s.store_id, s.data_iso, s.matricula, categoria;

-- Keeps the rollup in sync with `sales` going forward — covers every write
-- path generically (spreadsheet/image import, bulk reclassification from
-- Auditoria/Classificados, the delete-by-month admin tool, any future one)
-- instead of having to hook each one individually. SECURITY DEFINER because
-- the calling role (whichever authenticated session performs the write to
-- `sales`) has no RLS grant to write `sales_category_totals_daily` itself —
-- only this function, running as its owner, may.
create or replace function public.sync_sales_category_totals_daily_row()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_store_id uuid;
  v_data_iso date;
  v_matricula text;
begin
  if tg_op = 'DELETE' then
    v_store_id := old.store_id;
    v_data_iso := old.data_iso;
    v_matricula := old.matricula;
  else
    v_store_id := new.store_id;
    v_data_iso := new.data_iso;
    v_matricula := new.matricula;
  end if;

  delete from public.sales_category_totals_daily
    where store_id = v_store_id and data_iso = v_data_iso and matricula = v_matricula;

  insert into public.sales_category_totals_daily (store_id, data_iso, matricula, categoria, valor_total, itens_total)
  select s.store_id, s.data_iso, s.matricula, categoria, sum(s.valor), sum(s.qtd)
  from public.sales s,
    lateral unnest(array_remove(array[
      case when s.grupo in ('DERM', 'GEN', 'MP', 'MER') then s.grupo end,
      'ALL'
    ], null)) as categoria
  where s.store_id = v_store_id and s.data_iso = v_data_iso and s.matricula = v_matricula
  group by s.store_id, s.data_iso, s.matricula, categoria;

  -- An UPDATE can also reassign which bucket a sale belongs to (a manual
  -- correction changing its date or collaborator) — resync the bucket it
  -- LEFT too, or that bucket would keep counting a sale that moved away.
  if tg_op = 'UPDATE' and (old.store_id, old.data_iso, old.matricula) is distinct from (new.store_id, new.data_iso, new.matricula) then
    delete from public.sales_category_totals_daily
      where store_id = old.store_id and data_iso = old.data_iso and matricula = old.matricula;

    insert into public.sales_category_totals_daily (store_id, data_iso, matricula, categoria, valor_total, itens_total)
    select s.store_id, s.data_iso, s.matricula, categoria, sum(s.valor), sum(s.qtd)
    from public.sales s,
      lateral unnest(array_remove(array[
        case when s.grupo in ('DERM', 'GEN', 'MP', 'MER') then s.grupo end,
        'ALL'
      ], null)) as categoria
    where s.store_id = old.store_id and s.data_iso = old.data_iso and s.matricula = old.matricula
    group by s.store_id, s.data_iso, s.matricula, categoria;
  end if;

  return null;
end;
$function$;

create trigger sales_category_totals_daily_sync
after insert or update or delete on public.sales
for each row execute function public.sync_sales_category_totals_daily_row();

-- Rewritten to read DERM/GEN/MP/MER/ALL from the rollup instead of scanning
-- `sales`, and to compute LEVMEL/CHIP live (same inlined technique as
-- migration 0093, minus the now-redundant DERM/GEN/MP/MER/ALL tagging).
--
-- Also fixes a real bug found while rebuilding this: the previous version
-- required public.is_admin() in its WHERE clause, which silently returned
-- ZERO rows for any non-admin caller. `sales` itself has no such
-- restriction (sales_select only checks store_id = current_store_id()) —
-- every collaborator can already read the store's own sales directly. But
-- MetasVendasPage.tsx (the collaborator-facing "Metas/Vendas" screen) calls
-- this very RPC, so every collaborator opening that screen has been seeing
-- all-zero store/personal totals since it was wired to this RPC. Dropping
-- is_admin() here just brings the RPC back in line with the table's own
-- access rule — not a widening of what a collaborator could already reach
-- via a direct `sales` query.
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
  unit_tagged as (
    select
      s.matricula,
      s.valor,
      s.qtd,
      unnest(array_remove(array[
        case when exists (
          select 1 from unnest((select kws from levmel_kw)) as kw
          where lower(trim(extensions.unaccent(kw))) <> ''
            and position(lower(trim(extensions.unaccent(kw))) in lower(trim(extensions.unaccent(s.produto)))) > 0
        ) then 'LEVMEL' end,
        case when exists (
          select 1 from unnest((select kws from chip_kw)) as kw
          where lower(trim(extensions.unaccent(kw))) <> ''
            and position(lower(trim(extensions.unaccent(kw))) in lower(trim(extensions.unaccent(s.produto)))) > 0
        ) then 'CHIP' end
      ], null)) as categoria
    from public.sales s
    where s.store_id = public.current_store_id()
      and s.data_iso >= from_iso and s.data_iso <= to_iso
  )
  select matricula, categoria, sum(valor_total) as valor_total, sum(itens_total) as itens_total
  from public.sales_category_totals_daily
  where store_id = public.current_store_id()
    and data_iso >= from_iso and data_iso <= to_iso
  group by matricula, categoria
  union all
  select matricula, categoria, sum(valor) as valor_total, sum(qtd) as itens_total
  from unit_tagged
  group by matricula, categoria;
$function$;
