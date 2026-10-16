-- Fix: the "RESUMO DE VENDAS ATUALIZADO" notification (sent on every sales
-- import, dispatch_import_notification_for_collaborator) only listed a
-- category when the collaborator had at least one sale in it TODAY — a
-- category belonging to their setor (sector_base_categories) with zero
-- sales simply never appeared, instead of showing as R$ 0,00/0 un. Reported
-- by the user: a Balcão collaborator (DERM/GEN/MP/MER/LEVMEL all apply) only
-- ever saw Mercadoria Geral and Marcas Exclusivas whenever Dermo/Genérico/
-- Levmel had nothing sold that day.
--
-- Root cause: the category totals were computed by grouping actual sales
-- rows and tagging each with its category — a category with no matching row
-- never produced a group, so it never got inserted into `categorias`. Fixed
-- by iterating every category in `allowed` (the collaborator's own setor
-- list) and left-joining the sales totals, defaulting to 0 instead of
-- skipping the category outright. Nothing else in the function changes —
-- the generic category_types (Biosintética-like) section still only shows
-- up when there's actual progress, which is intentional and not what was
-- reported.
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
    with tagged as (
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
    ),
    totals as (
      select categoria, sum(valor) as valor_total, sum(qtd) as qtd_total
      from tagged
      group by categoria
    )
    select a.categoria, coalesce(t.valor_total, 0) as valor_total, coalesce(t.qtd_total, 0) as qtd_total
    from unnest(allowed) as a(categoria)
    left join totals t on t.categoria = a.categoria
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
