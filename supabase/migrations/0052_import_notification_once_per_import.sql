-- Corrige dois problemas relatados pelo usuário, com a mesma causa raiz:
--
-- 1. "Chegam várias notificações ao mesmo tempo para a mesma atualização
--    de vendas" — o disparo de notificação rodava num trigger AFTER
--    STATEMENT em `sales` (migration 0041), pensado para rodar "uma única
--    vez por lote". O problema: insertSalesInBatches (src/lib/salesImport.ts)
--    grava em lotes de até 500 linhas, cada INSERT é uma statement própria
--    — uma importação de 5 mil linhas dispara o trigger ~10 vezes, e cada
--    vendedor que aparece em mais de um lote (o normal, já que a planilha
--    não vem ordenada por vendedor) recebe uma notificação por lote em que
--    aparece, não uma só para a importação inteira.
--
-- 2. "Demora de 7 minutos para subir uma planilha de vendas" — mesma causa:
--    cada disparo do trigger recalcula, para cada vendedor do lote, a soma
--    de vendas do dia POR CATEGORIA e a pontuação Biosintética do MÊS
--    INTEIRO (bio_pontos_mes, que varre as vendas do mês daquele vendedor).
--    Com N lotes, esse recálculo caro roda até N vezes por vendedor em vez
--    de 1 — para uma planilha grande (vários lotes, dezenas de vendedores),
--    isso multiplica o tempo total de gravação várias vezes.
--
-- A correção: tirar o disparo de dentro do trigger por lote e chamá-lo
-- explicitamente do cliente UMA VEZ, depois que todos os lotes da
-- importação já terminaram de gravar (ver ImportarPage.tsx). A nova função
-- também não depende mais da transition table do trigger — ela olha
-- diretamente a tabela `sales` para "hoje", então continua computando o
-- resumo certo mesmo que os lotes tenham sido gravados em qualquer ordem.
drop trigger if exists sales_notify_on_import on public.sales;
drop function if exists public.notify_collaborators_on_sales_import();

create or replace function public.dispatch_todays_import_notifications(p_import_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  store_id_param uuid := public.current_store_id();
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  levmel_keywords text[];
  chip_keywords text[];
  grp record;
  colaborador record;
begin
  if store_id_param is null or not public.is_admin() then
    return;
  end if;

  -- Só dispara se ESTA importação (não uma anterior) realmente trouxe
  -- vendas de hoje — uma planilha só com dias retroativos não deve gerar
  -- nenhuma notificação (regra já existente, ver migration 0049).
  if not exists (
    select 1 from public.sales
    where import_id = p_import_id and store_id = store_id_param and data_iso = hoje
  ) then
    return;
  end if;

  if not exists (
    select 1 from public.store_settings ss
    where ss.store_id = store_id_param and ss.notify_on_sales_import
  ) then
    return;
  end if;

  select coalesce(array_agg(kw), '{}') into levmel_keywords
  from public.special_lists sl, lateral unnest(case when coalesce(array_length(sl.palavras, 1), 0) > 0 then sl.palavras else array[sl.nome] end) as kw
  where sl.store_id = store_id_param and sl.tipo = 'levmel';

  select coalesce(array_agg(kw), '{}') into chip_keywords
  from public.special_lists sl, lateral unnest(case when coalesce(array_length(sl.palavras, 1), 0) > 0 then sl.palavras else array[sl.nome] end) as kw
  where sl.store_id = store_id_param and sl.tipo = 'chip';

  -- Um resumo por vendedor que vendeu HOJE nesta loja (não só quem apareceu
  -- nesta importação) — mesma regra que o trigger antigo já seguia: o
  -- resumo reflete o dia inteiro, não só o lote/arquivo que acabou de subir.
  for grp in
    select distinct matricula from public.sales
    where store_id = store_id_param and data_iso = hoje
  loop
    select id, apelido, nome, setor into colaborador
    from public.collaborators
    where store_id = store_id_param and matricula = grp.matricula;

    if colaborador.id is null then
      continue;
    end if;

    perform public.dispatch_import_notification_for_collaborator(
      store_id_param, colaborador.id, grp.matricula, colaborador.apelido, colaborador.nome, colaborador.setor,
      levmel_keywords, chip_keywords, hoje
    );
  end loop;
end;
$$;

revoke all on function public.dispatch_todays_import_notifications(uuid) from public, anon;
grant execute on function public.dispatch_todays_import_notifications(uuid) to authenticated;

-- Segundo fator de lentidão, independente do trigger-por-lote acima:
-- classify_bio() não é barata (percorre bio_groups fazendo busca de
-- substring por produto) e a versão anterior (migration 0049) chamava ela
-- até 3 vezes por venda do vendedor no mês — uma vez na consulta de
-- "itens hoje" e duas vezes na consulta de "pontos do mês" (uma no WHERE,
-- outra no SELECT, sem cache entre as duas). Reescrita para classificar
-- cada venda do mês uma única vez (via CTE) e derivar os dois números
-- (itens hoje / pontos do mês) do mesmo resultado já classificado.
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
set search_path = public, extensions
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
  -- colaborador — só existe classificação pronta para a chave
  -- 'biosintetica' (via classify_bio); uma futura categoria genérica com
  -- outro motor de classificação precisará de um ramo próprio aqui.
  for ct in
    select id, chave, nome
    from public.category_types
    where store_id = store_id_param and ativo and setor_param = any(setores_elegiveis)
  loop
    if ct.chave = 'biosintetica' then
      with classificado as (
        select s.qtd, s.data_iso, public.classify_bio(s.produto, store_id_param) as grupo
        from public.sales s
        where s.store_id = store_id_param
          and s.matricula = matricula_param
          and s.data_iso >= date_trunc('month', dia)::date
          and s.data_iso <= dia
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

revoke execute on function public.dispatch_import_notification_for_collaborator(uuid, uuid, text, text, text, text, text[], text[], date) from public, anon, authenticated;
grant execute on function public.dispatch_import_notification_for_collaborator(uuid, uuid, text, text, text, text, text[], text[], date) to authenticated;
