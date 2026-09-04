-- REGRA 2 archival, moved server-side. Previously this ran in the admin's
-- own browser (src/lib/archival.ts, useAutoArchiveOldSales) once a day —
-- real CPU work (reclassifying every 3+-month-old sale, then deleting it in
-- batches) happening silently in whoever's tab logged in first, with no
-- progress indicator, able to coincide with normal use and stall the UI for
-- a few seconds. This ports the exact same logic (same cutoff, same
-- overlapping-tags model — DERM/GEN/MP/MER from `grupo`, LEVMEL/CHIP and
-- BIOSINTÉTICA G1-G4 by keyword match, same "archive first, delete only on
-- success" order) into a scheduled Postgres job via pg_cron, so it runs once
-- a day on the server regardless of who's logged in, without needing any
-- HTTP call or secret key to invoke (pg_cron just calls a plpgsql function
-- directly, in-process).
--
-- Keep this in sync by hand with src/lib/archival.ts if that logic ever
-- changes — there's no shared source between the TS and SQL versions.

create extension if not exists unaccent with schema extensions;

-- Mirrors src/lib/business/normalize.ts's normalize(): lowercase + accent
-- stripping (unaccent covers the same Portuguese diacritics normalize()'s
-- NFD-decompose-and-strip approach does) + trim.
create or replace function public.normalize_text(input text)
returns text
language sql
immutable
as $$
  select lower(trim(unaccent(coalesce(input, ''))));
$$;

-- Mirrors src/lib/business/summary.ts's matchesSpecialList(): true if the
-- product name contains ANY of the given keywords as a substring (no
-- length floor, unlike classify_bio below). `keywords` is expected to
-- already have the "empty palavras falls back to the list item's own nome"
-- substitution applied by the caller (see archive_old_sales_for_store).
create or replace function public.matches_special_list(produto text, keywords text[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from unnest(coalesce(keywords, '{}')) as kw
    where normalize_text(kw) <> '' and position(normalize_text(kw) in normalize_text(produto)) > 0
  );
$$;

-- Mirrors src/lib/business/classification.ts's classifyBio(): longest
-- keyword match (>= 3 normalized chars) across every bio_groups row under
-- the store's BIOSINTÉTICA category_type wins; a keyword that literally
-- equals its own group's code is discarded first (guards against the same
-- data-corruption pattern classifyBio's keywordsOf() guards against —
-- palavras === [grupo] turning "does this contain 'g1'?" into a de facto
-- rule), falling back to the row's own nome if that empties its keyword
-- list. Returns null when nothing matches, or when the store has no
-- BIOSINTÉTICA category_type at all.
create or replace function public.classify_bio(produto text, store_id_param uuid)
returns text
language plpgsql
stable
as $$
declare
  n text := normalize_text(produto);
  ct_id uuid;
  grp record;
  raw_keywords text[];
  cleaned_keywords text[];
  code_norm text;
  kw text;
  kw_norm text;
  best_group text := null;
  best_len int := 0;
begin
  if n = '' then
    return null;
  end if;

  select id into ct_id from public.category_types where store_id = store_id_param and chave = 'biosintetica' limit 1;
  if ct_id is null then
    return null;
  end if;

  for grp in select bg.grupo, bg.nome, bg.palavras from public.bio_groups bg where bg.category_type_id = ct_id loop
    raw_keywords := case when coalesce(array_length(grp.palavras, 1), 0) > 0 then grp.palavras else array[grp.nome] end;
    code_norm := normalize_text(grp.grupo);
    select coalesce(array_agg(k), '{}') into cleaned_keywords from unnest(raw_keywords) as k where normalize_text(k) <> code_norm;
    if coalesce(array_length(cleaned_keywords, 1), 0) = 0 then
      cleaned_keywords := array[grp.nome];
    end if;

    foreach kw in array cleaned_keywords loop
      kw_norm := normalize_text(kw);
      if length(kw_norm) >= 3 and position(kw_norm in n) > 0 and length(kw_norm) > best_len then
        best_len := length(kw_norm);
        best_group := grp.grupo;
      end if;
    end loop;
  end loop;

  return best_group;
end;
$$;

-- Mirrors archiveOldSalesForStore() + computeArchiveAggregates() in
-- src/lib/archival.ts for one store: aggregates every sale older than
-- `cutoff` into sales_archive_categories/sales_archive_collaborators (an
-- upsert that REPLACES, not adds to, any existing row for that
-- store/month/category — matching the client version's plain `.upsert()`;
-- safe because a month's raw sales are deleted the same run they're first
-- archived, so a later run never re-aggregates an already-archived month
-- unless new rows were imported for it after the fact, in which case this
-- has the same "last run wins" limitation the original client-side version
-- already had), then deletes the archived rows — aggregates are written
-- first, so a failure here never loses data, just leaves it for tomorrow's
-- run to pick up again.
create or replace function public.archive_old_sales_for_store(store_id_param uuid, cutoff date)
returns jsonb
language plpgsql
as $$
declare
  levmel_keywords text[];
  chip_keywords text[];
  old_count int;
  deleted_count int := 0;
  archived_months jsonb;
begin
  select coalesce(array_agg(kw), '{}') into levmel_keywords
  from public.special_lists sl, lateral unnest(case when coalesce(array_length(sl.palavras, 1), 0) > 0 then sl.palavras else array[sl.nome] end) as kw
  where sl.store_id = store_id_param and sl.tipo = 'levmel';

  select coalesce(array_agg(kw), '{}') into chip_keywords
  from public.special_lists sl, lateral unnest(case when coalesce(array_length(sl.palavras, 1), 0) > 0 then sl.palavras else array[sl.nome] end) as kw
  where sl.store_id = store_id_param and sl.tipo = 'chip';

  select count(*) into old_count from public.sales where store_id = store_id_param and data_iso < cutoff;
  if old_count = 0 then
    return jsonb_build_object('store_id', store_id_param, 'archived_months', '[]'::jsonb, 'deleted_count', 0);
  end if;

  insert into public.sales_archive_categories (store_id, year_month, categoria, valor_total, itens_total, vendas_total)
  select store_id_param, month, categoria, sum(valor), sum(itens), count(*)
  from (
    select
      date_trunc('month', s.data_iso)::date as month,
      s.valor,
      s.qtd as itens,
      unnest(array_remove(array[
        case when s.grupo in ('DERM', 'GEN', 'MP', 'MER') then s.grupo end,
        case when public.matches_special_list(s.produto, levmel_keywords) then 'LEVMEL' end,
        case when public.matches_special_list(s.produto, chip_keywords) then 'CHIP' end,
        case when c.bio_group in ('G1', 'G2', 'G3', 'G4') then c.bio_group end
      ], null)) as categoria
    from public.sales s
    cross join lateral (select public.classify_bio(s.produto, store_id_param) as bio_group) c
    where s.store_id = store_id_param and s.data_iso < cutoff
  ) tagged
  group by month, categoria
  on conflict (store_id, year_month, categoria) do update
    set valor_total = excluded.valor_total, itens_total = excluded.itens_total, vendas_total = excluded.vendas_total;

  insert into public.sales_archive_collaborators (store_id, year_month, matricula, nome, valor_total, itens_total)
  select store_id_param,
    date_trunc('month', s.data_iso)::date,
    s.matricula,
    coalesce(max(nullif(s.vendedor, '')), s.matricula),
    sum(s.valor),
    sum(s.qtd)
  from public.sales s
  where s.store_id = store_id_param and s.data_iso < cutoff
  group by date_trunc('month', s.data_iso)::date, s.matricula
  on conflict (store_id, year_month, matricula) do update
    set nome = excluded.nome, valor_total = excluded.valor_total, itens_total = excluded.itens_total;

  select coalesce(jsonb_agg(distinct to_char(date_trunc('month', s.data_iso), 'YYYY-MM-DD')), '[]'::jsonb)
    into archived_months
  from public.sales s where s.store_id = store_id_param and s.data_iso < cutoff;

  delete from public.sales where store_id = store_id_param and data_iso < cutoff;
  get diagnostics deleted_count = row_count;

  return jsonb_build_object('store_id', store_id_param, 'archived_months', archived_months, 'deleted_count', deleted_count);
end;
$$;

-- Entry point pg_cron calls — loops every store, same 3-month retention
-- window as archiveCutoffISO() in src/lib/archival.ts.
create or replace function public.archive_old_sales()
returns jsonb
language plpgsql
as $$
declare
  cutoff date := (date_trunc('month', now()) - interval '3 months')::date;
  store record;
  results jsonb := '[]'::jsonb;
begin
  for store in select id from public.stores loop
    results := results || jsonb_build_array(public.archive_old_sales_for_store(store.id, cutoff));
  end loop;
  return jsonb_build_object('cutoff', cutoff, 'results', results);
end;
$$;

-- None of these have a legitimate caller besides the cron job itself —
-- same hardening pattern as 0002_harden_helper_function_grants.sql.
revoke execute on function public.normalize_text(text) from public, anon, authenticated;
revoke execute on function public.matches_special_list(text, text[]) from public, anon, authenticated;
revoke execute on function public.classify_bio(text, uuid) from public, anon, authenticated;
revoke execute on function public.archive_old_sales_for_store(uuid, date) from public, anon, authenticated;
revoke execute on function public.archive_old_sales() from public, anon, authenticated;

-- Runs daily at 06:00 UTC (off-peak for this store's timezone). cron.schedule
-- upserts by job name, so re-running this migration is safe.
select cron.schedule('archive-old-sales-daily', '0 6 * * *', $$select public.archive_old_sales();$$);
