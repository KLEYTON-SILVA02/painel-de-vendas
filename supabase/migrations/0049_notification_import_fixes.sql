-- Três ajustes no motor de notificação por importação (migration 0041):
--
-- 1. Levmel/Chip são categorias de UNIDADE, não de dinheiro (mesma
--    convenção usada em todo o resto do app — DailyEvolutionChart, Ranking,
--    Metas) — a notificação somava e formatava o valor em R$ dessas duas
--    categorias, quando deveria mostrar a quantidade de itens vendidos.
--    Consequência: elas também não entram mais na soma de "TOTAL DO DIA"
--    (que é um total em R$; misturar uma contagem de unidades ali
--    produziria um número sem sentido).
--
-- 2. Biosintética, para o colaborador, agora mostra dois valores: a
--    quantidade de itens vendidos NO DIA e a pontuação total acumulada no
--    MÊS INTEIRO (não só o valor em R$ do dia) — mesma lógica de pontuação
--    (bio_weights × classify_bio) já usada pela tela Biosintética.
--
-- 3. O disparo só acontece quando o lote importado tem vendas DE HOJE
--    (fuso America/Sao_Paulo) — uma importação de vendas de dias
--    anteriores não deve gerar notificação nenhuma.
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
      select coalesce(sum(s.qtd), 0) into bio_itens_hoje
      from public.sales s
      where s.store_id = store_id_param
        and s.matricula = matricula_param
        and s.data_iso = dia
        and public.classify_bio(s.produto, store_id_param) is not null;

      select coalesce(sum(s.qtd * coalesce((sw.bio_weights ->> public.classify_bio(s.produto, store_id_param))::numeric, 0)), 0)
        into bio_pontos_mes
      from public.sales s
      cross join public.store_settings sw
      where s.store_id = store_id_param
        and sw.store_id = store_id_param
        and s.matricula = matricula_param
        and s.data_iso >= date_trunc('month', dia)::date
        and s.data_iso <= dia
        and public.classify_bio(s.produto, store_id_param) is not null;

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

-- Só agrupa/dispara para vendas cuja data é HOJE (fuso America/Sao_Paulo) —
-- uma importação com vendas de dias anteriores não deve gerar notificação.
create or replace function public.notify_collaborators_on_sales_import()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  levmel_keywords text[];
  chip_keywords text[];
  grp record;
  colaborador record;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not exists (
    select 1 from public.store_settings ss
    where ss.store_id = (select store_id from nova_venda limit 1)
      and ss.notify_on_sales_import
  ) then
    return null;
  end if;

  for grp in
    select store_id, matricula, data_iso
    from nova_venda
    where data_iso = hoje
    group by store_id, matricula, data_iso
  loop
    select id, apelido, nome, setor into colaborador
    from public.collaborators
    where store_id = grp.store_id and matricula = grp.matricula;

    if colaborador.id is null then
      continue;
    end if;

    select coalesce(array_agg(kw), '{}') into levmel_keywords
    from public.special_lists sl, lateral unnest(case when coalesce(array_length(sl.palavras, 1), 0) > 0 then sl.palavras else array[sl.nome] end) as kw
    where sl.store_id = grp.store_id and sl.tipo = 'levmel';

    select coalesce(array_agg(kw), '{}') into chip_keywords
    from public.special_lists sl, lateral unnest(case when coalesce(array_length(sl.palavras, 1), 0) > 0 then sl.palavras else array[sl.nome] end) as kw
    where sl.store_id = grp.store_id and sl.tipo = 'chip';

    perform public.dispatch_import_notification_for_collaborator(
      grp.store_id, colaborador.id, grp.matricula, colaborador.apelido, colaborador.nome, colaborador.setor,
      levmel_keywords, chip_keywords, grp.data_iso
    );
  end loop;

  return null;
end;
$$;

revoke execute on function public.dispatch_import_notification_for_collaborator(uuid, uuid, text, text, text, text, text[], text[], date) from public, anon, authenticated;
revoke execute on function public.notify_collaborators_on_sales_import() from public, anon, authenticated;
