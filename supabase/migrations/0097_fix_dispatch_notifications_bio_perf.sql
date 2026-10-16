-- Fix: dispatch_todays_import_notifications (called from salesImport.ts on
-- every import) was returning HTTP 500 in production — confirmed in
-- edge_logs (repeated "POST /rpc/dispatch_todays_import_notifications 500"
-- around each real import's timestamp on 15-16/10/2026). Not a SQL error —
-- reproducing it directly (impersonating the real admin, real import ids)
-- raised no exception, but took over 35 SECONDS for a single call, which
-- is well past any reasonable PostgREST statement timeout and matches a
-- 500 with no particular error body.
--
-- Root cause: dispatch_import_notification_for_collaborator's Biosintética/
-- generic-category branch calls classify_bio()/classify_bio_for_category()
-- once per SALES ROW in the collaborator's current month (a correlated
-- subquery), and each of those calls re-queries `bio_groups` from scratch
-- internally — migration 0052's own comment already flagged this exact
-- function as "não é barata" (not cheap) and reduced it from 3 calls/row to
-- 1, but even 1 DB-hitting call per row was always going to blow up once a
-- store's monthly sales volume grew enough (this store: ~30k sales/month,
-- several "Balcão" collaborators each contributing hundreds to thousands of
-- rows to that monthly scan). dispatch_sales_notification_for_collaborator
-- (migration 0039, used by the dispatch-sales-notifications cron every 5
-- min) has the same per-row classify_bio() call, just scoped to "hoje"
-- instead of the whole month — not yet measured as slow, but the same
-- latent bug, so fixed here too before it becomes the next incident as
-- daily volume grows.
--
-- Fix: classify_bio_for_category_batch() loads `bio_groups` for a category
-- type exactly ONCE, then matches every DISTINCT product name against that
-- already-loaded keyword list in memory — same matching algorithm as
-- classify_bio_for_category (longest keyword match wins, same cleaned-
-- keywords fallback), just computed once per distinct product instead of
-- once per row and with zero extra DB round-trips in the loop. Both
-- dispatch functions now pre-fetch their row-level data (qtd/data_iso/
-- produto) first, batch-classify the distinct produtos in one call, then
-- join the mapping back — same final numbers, no per-row function calls.
create or replace function public.classify_bio_for_category_batch(category_type_id_param uuid, produtos text[])
returns table(produto text, grupo text)
language plpgsql
stable
as $$
declare
  grp record;
  raw_keywords text[];
  cleaned_keywords text[];
  code_norm text;
  kw text;
  kw_grupos text[] := '{}';
  kw_norms text[] := '{}';
  total_kw int;
  p text;
  n text;
  best_group text;
  best_len int;
  kw_norm text;
  i int;
begin
  if category_type_id_param is null then
    return;
  end if;

  -- Same per-group keyword resolution as classify_bio_for_category, just
  -- run once total instead of once per sales row: flattened into two
  -- parallel arrays (kw_grupos[i] is the group for keyword kw_norms[i]).
  for grp in select bg.grupo, bg.nome, bg.palavras from public.bio_groups bg where bg.category_type_id = category_type_id_param loop
    raw_keywords := case when coalesce(array_length(grp.palavras, 1), 0) > 0 then grp.palavras else array[grp.nome] end;
    code_norm := normalize_text(grp.grupo);
    select coalesce(array_agg(k), '{}') into cleaned_keywords from unnest(raw_keywords) as k where normalize_text(k) <> code_norm;
    if coalesce(array_length(cleaned_keywords, 1), 0) = 0 then
      cleaned_keywords := array[grp.nome];
    end if;

    foreach kw in array cleaned_keywords loop
      kw_grupos := array_append(kw_grupos, grp.grupo);
      kw_norms := array_append(kw_norms, normalize_text(kw));
    end loop;
  end loop;

  total_kw := coalesce(array_length(kw_grupos, 1), 0);

  foreach p in array produtos loop
    n := normalize_text(p);
    best_group := null;
    best_len := 0;
    if n <> '' and total_kw > 0 then
      for i in 1..total_kw loop
        kw_norm := kw_norms[i];
        if length(kw_norm) >= 3 and position(kw_norm in n) > 0 and length(kw_norm) > best_len then
          best_len := length(kw_norm);
          best_group := kw_grupos[i];
        end if;
      end loop;
    end if;
    produto := p;
    grupo := best_group;
    return next;
  end loop;
end;
$$;

revoke all on function public.classify_bio_for_category_batch(uuid, text[]) from public, anon, authenticated;

create or replace function public.dispatch_sales_notification_for_collaborator(
  store_id_param uuid,
  collaborator_id_param uuid,
  matricula_param text,
  levmel_keywords text[],
  chip_keywords text[],
  hoje date
)
returns void
language plpgsql
as $$
declare
  categorias jsonb;
  total numeric;
  resumo text;
  bio_category_type_id uuid;
begin
  select id into bio_category_type_id from public.category_types where store_id = store_id_param and chave = 'biosintetica' limit 1;

  select coalesce(jsonb_object_agg(categoria, valor_total), '{}'::jsonb), coalesce(sum(valor_total), 0)
    into categorias, total
  from (
    select categoria, sum(valor) as valor_total
    from (
      select
        s.valor,
        unnest(array_remove(array[
          case when s.grupo in ('DERM', 'GEN', 'MP', 'MER') then s.grupo end,
          case when public.matches_special_list(s.produto, levmel_keywords) then 'LEVMEL' end,
          case when public.matches_special_list(s.produto, chip_keywords) then 'CHIP' end,
          case when c.bio_group in ('G1', 'G2', 'G3', 'G4') then c.bio_group end
        ], null)) as categoria
      from public.sales s
      left join (
        select * from public.classify_bio_for_category_batch(
          bio_category_type_id,
          (select coalesce(array_agg(distinct s2.produto), '{}') from public.sales s2 where s2.store_id = store_id_param and s2.matricula = matricula_param and s2.data_iso = hoje)
        )
      ) c on c.produto = s.produto
      where s.store_id = store_id_param
        and s.matricula = matricula_param
        and s.data_iso = hoje
    ) tagged
    group by categoria
  ) totals;

  select string_agg(format('%s: %s', key, public.format_money_brl((value)::numeric)), E'\n' order by key)
    into resumo
  from jsonb_each_text(categorias);

  insert into public.notifications (store_id, collaborator_id, title, body, data)
  values (
    store_id_param,
    collaborator_id_param,
    'Atualização de vendas',
    coalesce(resumo, 'Nenhuma venda registrada ainda hoje.') || format(E'\nTotal: %s', public.format_money_brl(total)),
    jsonb_build_object('categorias', categorias, 'total', total, 'data', hoje)
  );
end;
$$;

create or replace function public.dispatch_import_notification_for_collaborator(
  store_id_param uuid,
  collaborator_id_param uuid,
  matricula_param text,
  apelido_param text,
  nome_param text,
  setor_param text,
  levmel_keywords text[],
  chip_keywords text[],
  dia date
)
returns void
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  allowed text[] := public.sector_base_categories(setor_param);
  categorias jsonb := '{}'::jsonb;
  total numeric := 0;
  linhas text;
  destinatario text := coalesce(nullif(apelido_param, ''), nome_param);
  agora timestamptz := now();
  ct record;
  bio_itens_hoje numeric;
  bio_pontos_mes numeric;
  rec record;
begin
  for rec in
    select categoria, sum(valor) as valor_total, sum(qtd) as qtd_total
    from (
      select
        s.valor,
        s.qtd,
        unnest(array_remove(array[
          case when s.grupo in ('DERM', 'GEN', 'MP', 'MER') then s.grupo end,
          case when public.matches_special_list(s.produto, levmel_keywords) then 'LEVMEL' end,
          case when public.matches_special_list(s.produto, chip_keywords) then 'CHIP' end
        ], null)) as categoria
      from public.sales s
      where s.store_id = store_id_param
        and s.matricula = matricula_param
        and s.data_iso = dia
    ) tagged
    where categoria = any(allowed)
    group by categoria
  loop
    if rec.categoria in ('LEVMEL', 'CHIP') then
      categorias := categorias || jsonb_build_object(rec.categoria, rec.qtd_total::text || ' un.');
    else
      categorias := categorias || jsonb_build_object(rec.categoria, public.format_money_brl(rec.valor_total));
      total := total + rec.valor_total;
    end if;
  end loop;

  -- Categorias genéricas (ex.: Biosintética) elegíveis para o setor deste
  -- colaborador. Antes classify_bio()/classify_bio_for_category() eram
  -- chamadas uma vez POR VENDA do mês (uma consulta a bio_groups a cada
  -- chamada) — agora o mês inteiro é lido uma vez em `linhas`, os produtos
  -- distintos são classificados em uma única chamada em lote, e o
  -- resultado é religado por produto — mesmos números finais, sem repetir
  -- a consulta a bio_groups por linha.
  for ct in
    select id, chave, nome
    from public.category_types
    where store_id = store_id_param and ativo and setor_param = any(setores_elegiveis)
  loop
    with linhas as (
      select s.qtd, s.data_iso, s.produto
      from public.sales s
      where s.store_id = store_id_param
        and s.matricula = matricula_param
        and s.data_iso >= date_trunc('month', dia)::date
        and s.data_iso <= dia
    ),
    mapa as (
      select * from public.classify_bio_for_category_batch(
        ct.id,
        (select coalesce(array_agg(distinct produto), '{}') from linhas)
      )
    ),
    classificado as (
      select l.qtd, l.data_iso, m.grupo
      from linhas l
      left join mapa m on m.produto = l.produto
    )
    select
      coalesce(sum(c.qtd) filter (where c.data_iso = dia and c.grupo is not null), 0),
      coalesce(sum(c.qtd * coalesce((sw.bio_weights ->> c.grupo)::numeric, 0)) filter (where c.grupo is not null), 0)
      into bio_itens_hoje, bio_pontos_mes
    from classificado c
    cross join public.store_settings sw
    where sw.store_id = store_id_param;

    if bio_itens_hoje > 0 or bio_pontos_mes > 0 then
      categorias := categorias || jsonb_build_object(
        ct.nome,
        format('%s un. hoje · %s pts no mês', bio_itens_hoje, trim(to_char(bio_pontos_mes, 'FM999999990.0')))
      );
    end if;
  end loop;

  if categorias = '{}'::jsonb then
    return;
  end if;

  select string_agg(
    format('▪️ %s: %s', public.category_display_label(key), value),
    E'\n' order by public.category_display_order(key), key
  )
    into linhas
  from jsonb_each_text(categorias);

  insert into public.notifications (store_id, collaborator_id, title, body, data)
  values (
    store_id_param,
    collaborator_id_param,
    '📊 RESUMO DE VENDAS ATUALIZADO 📊',
    format(
      E'Olá, *%s*! 👋\nAqui está o acompanhamento das suas vendas de hoje:\n\n🏢 *Setor:* %s\n📅 *Data:* %s | ⏰ *Hora:* %s\n\n━━━━━━━━━━━━━━━━━━━━\n📦 *DESEMPENHO POR CATEGORIA*\n━━━━━━━━━━━━━━━━━━━━\n%s\n\n━━━━━━━━━━━━━━━━━━━━\n💰 *TOTAL DO DIA:* %s\n━━━━━━━━━━━━━━━━━━━━\n\n_Boas vendas e foco nos resultados!_ 🚀',
      destinatario,
      setor_param,
      to_char(dia, 'DD/MM/YYYY'),
      to_char(agora at time zone 'America/Sao_Paulo', 'HH24:MI'),
      linhas,
      public.format_money_brl(total)
    ),
    jsonb_build_object('categorias', categorias, 'total', total, 'data', dia, 'setor', setor_param, 'origem', 'import')
  );
end;
$$;

revoke all on function public.dispatch_import_notification_for_collaborator(uuid, uuid, text, text, text, text, text[], text[], date) from public, anon;
grant execute on function public.dispatch_import_notification_for_collaborator(uuid, uuid, text, text, text, text, text[], text[], date) to authenticated;
