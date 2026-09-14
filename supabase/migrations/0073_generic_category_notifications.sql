-- Fase 2 item 4 (marcado "alto risco" no planejamento): estende o resumo de
-- vendas por importação (ver 0041/0052) para QUALQUER categoria genérica
-- ativa que o setor do colaborador seja elegível — hoje só BIOSINTÉTICA
-- disparava esse resumo; uma categoria criada depois em ADM > Gerenciar
-- Categorias (CategoryTypePage.tsx) simplesmente não aparecia na mensagem,
-- mesmo tendo o mesmo motor de grupos/classificação por trás.
--
-- Nenhuma loja em produção tinha, até esta migration, criado uma categoria
-- genérica além de BIOSINTÉTICA (conferido via
-- `select * from category_types where chave <> 'biosintetica'` antes de
-- aplicar) — logo esta mudança não altera o comportamento de nenhuma loja
-- hoje; ela só passa a valer quando um ADM criar sua primeira categoria
-- extra.
--
-- classify_bio_for_category(produto, category_type_id) generaliza o miolo de
-- classify_bio (mesmo algoritmo de match por palavra-chave mais longa,
-- >= 3 chars normalizados) para receber o category_type_id diretamente em
-- vez de sempre resolver 'biosintetica' internamente. classify_bio passa a
-- ser um wrapper fino sobre esta função — mesmo comportamento de sempre
-- para BIOSINTÉTICA, sem duplicar a lógica de match.
create or replace function public.classify_bio_for_category(produto text, category_type_id_param uuid)
returns text
language plpgsql
stable
as $$
declare
  n text := normalize_text(produto);
  grp record;
  raw_keywords text[];
  cleaned_keywords text[];
  code_norm text;
  kw text;
  kw_norm text;
  best_group text := null;
  best_len int := 0;
begin
  if n = '' or category_type_id_param is null then
    return null;
  end if;

  for grp in select bg.grupo, bg.nome, bg.palavras from public.bio_groups bg where bg.category_type_id = category_type_id_param loop
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

revoke execute on function public.classify_bio_for_category(text, uuid) from public, anon, authenticated;

-- Wrapper: resolve o category_type_id de BIOSINTÉTICA e delega — idêntico ao
-- comportamento anterior (mesmo algoritmo, mesmos parâmetros de chamada em
-- todo o resto do sistema, que continua passando store_id).
create or replace function public.classify_bio(produto text, store_id_param uuid)
returns text
language plpgsql
stable
as $$
declare
  ct_id uuid;
begin
  select id into ct_id from public.category_types where store_id = store_id_param and chave = 'biosintetica' limit 1;
  if ct_id is null then
    return null;
  end if;
  return public.classify_bio_for_category(produto, ct_id);
end;
$$;

revoke execute on function public.classify_bio(text, uuid) from public, anon, authenticated;

-- Generaliza o loop de categorias genéricas do resumo por importação: o
-- ramo BIOSINTÉTICA continua idêntico (mesma fonte de peso,
-- store_settings.bio_weights — ver comentário da migration 0028 sobre por
-- que ela ainda não foi unificada com bio_group_goals.peso); o `else` novo
-- cobre qualquer outra categoria ativa e elegível para o setor, usando
-- classify_bio_for_category + bio_group_goals.peso (a mesma fonte de peso
-- que CategoryTypePage.tsx já usa na tela) — mesma matemática (qtd * peso
-- por grupo, somada) que o ADM já vê na tela "Pontos" daquela categoria, só
-- que aplicada ao dia/mês do colaborador para a notificação.
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

  -- Categorias genéricas (BIOSINTÉTICA + qualquer categoria criada pelo ADM
  -- em Gerenciar Categorias) elegíveis para o setor deste colaborador.
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
    else
      with classificado as (
        select s.qtd, s.data_iso, public.classify_bio_for_category(s.produto, ct.id) as grupo
        from public.sales s
        where s.store_id = store_id_param
          and s.matricula = matricula_param
          and s.data_iso >= date_trunc('month', dia)::date
          and s.data_iso <= dia
      )
      select
        coalesce(sum(c.qtd) filter (where c.data_iso = dia and c.grupo is not null), 0),
        coalesce(sum(c.qtd * coalesce(bgg.peso, 0)) filter (where c.grupo is not null), 0)
        into bio_itens_hoje, bio_pontos_mes
      from classificado c
      left join public.bio_group_goals bgg
        on bgg.store_id = store_id_param and bgg.category_type_id = ct.id and bgg.grupo = c.grupo;
    end if;

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

revoke execute on function public.dispatch_import_notification_for_collaborator(uuid, uuid, text, text, text, text, text[], text[], date) from public, anon, authenticated;
grant execute on function public.dispatch_import_notification_for_collaborator(uuid, uuid, text, text, text, text, text[], text[], date) to authenticated;
