-- Módulo de Notificações — motor de disparo por importação: em vez de só
-- esperar um horário programado (Etapa 1b), agora toda vez que uma
-- planilha de vendas é importada, cada colaborador que aparece nela recebe
-- (quase) na hora um resumo pessoal das vendas daquele dia, filtrado pelas
-- categorias do seu próprio setor. Convive com o sistema de horários
-- existente (não substitui) — a ADM decide independentemente se quer os
-- dois ligados, só o de horário, ou só o de importação, via o toggle
-- abaixo em store_settings.
alter table public.store_settings
  add column if not exists notify_on_sales_import boolean not null default true;

-- Categorias fixas visíveis por setor — BIOSINTÉTICA (ou qualquer futura
-- categoria genérica criada em ADM > Categorias) NÃO entra aqui: ela é
-- adicionada dinamicamente por colaborador, lendo category_types.
-- setores_elegiveis em tempo real (ver dispatch_import_notification_for_
-- collaborator abaixo) — criar/realocar uma categoria genérica nunca
-- exige tocar nesta função.
create or replace function public.sector_base_categories(setor_param text)
returns text[]
language sql
immutable
as $$
  select case setor_param
    when 'Balcão' then array['MER', 'MP', 'DERM', 'GEN', 'LEVMEL']
    when 'Caixa' then array['MER', 'MP', 'DERM', 'LEVMEL', 'CHIP']
    when 'Dermoconsultora' then array['MER', 'MP', 'DERM', 'LEVMEL', 'CHIP']
    when 'Gerência' then array['MER', 'MP', 'DERM', 'GEN', 'LEVMEL', 'CHIP']
    when 'Farmacêutico' then array['MER', 'MP', 'DERM', 'GEN', 'LEVMEL', 'CHIP']
    else array['MER', 'MP', 'DERM', 'GEN', 'LEVMEL', 'CHIP']
  end;
$$;

-- Rótulo de exibição para as categorias fixas — uma categoria genérica
-- (chave usada é o próprio nome cadastrado em category_types, ex.:
-- "Biosintética") já chega pronta e passa direto pelo `else`.
create or replace function public.category_display_label(categoria text)
returns text
language sql
immutable
as $$
  select case categoria
    when 'MER' then 'Mercadoria Geral'
    when 'MP' then 'Marcas Exclusivas'
    when 'DERM' then 'Dermocosméticos'
    when 'GEN' then 'Genéricos'
    when 'LEVMEL' then 'Levmel'
    when 'CHIP' then 'Chip'
    else categoria
  end;
$$;

-- Ordem de exibição das linhas da mensagem — mantém as categorias fixas na
-- ordem "natural" do sistema e joga qualquer categoria genérica pro final.
create or replace function public.category_display_order(categoria text)
returns int
language sql
immutable
as $$
  select case categoria
    when 'MER' then 1
    when 'MP' then 2
    when 'DERM' then 3
    when 'GEN' then 4
    when 'LEVMEL' then 5
    when 'CHIP' then 6
    else 99
  end;
$$;

-- Calcula as vendas de UM colaborador em UM dia, filtra pelas categorias do
-- setor dele, e grava a notificação formatada — layout obrigatório definido
-- pelo cliente (emojis e *negrito* estilo WhatsApp inclusive, mantidos
-- literalmente no texto). SECURITY DEFINER é necessário aqui: isso é
-- chamado de dentro do trigger de import (rodando como a sessão comum da
-- ADM, não como o superusuário do pg_cron), e a tabela notifications não
-- tem nenhuma policy de INSERT para authenticated — só INSERT bypassando
-- RLS (via SECURITY DEFINER) consegue gravar a notificação pendente.
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
  bio_valor numeric;
  rec record;
begin
  for rec in
    select categoria, sum(valor) as valor_total
    from (
      select
        s.valor,
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
    categorias := categorias || jsonb_build_object(rec.categoria, rec.valor_total);
    total := total + rec.valor_total;
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
      select coalesce(sum(s.valor), 0) into bio_valor
      from public.sales s
      where s.store_id = store_id_param
        and s.matricula = matricula_param
        and s.data_iso = dia
        and public.classify_bio(s.produto, store_id_param) is not null;
      if bio_valor > 0 then
        categorias := categorias || jsonb_build_object(ct.nome, bio_valor);
        total := total + bio_valor;
      end if;
    end if;
  end loop;

  if categorias = '{}'::jsonb then
    return;
  end if;

  select string_agg(
    format('▪️ %s: %s', public.category_display_label(key), public.format_money_brl((value)::numeric)),
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

-- Trigger de nível de STATEMENT (não de linha): uma importação de planilha
-- insere em lotes de até 500 linhas de uma vez (ver insertSalesInBatches em
-- src/lib/salesImport.ts) — com `referencing new table`, o gatilho recebe
-- o lote inteiro de uma só vez em vez de rodar uma vez por linha inserida,
-- então processa cada (colaborador, dia) distinto do lote uma única vez.
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
    where data_iso is not null
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

drop trigger if exists sales_notify_on_import on public.sales;
create trigger sales_notify_on_import
  after insert on public.sales
  referencing new table as nova_venda
  for each statement
  execute function public.notify_collaborators_on_sales_import();

revoke execute on function public.sector_base_categories(text) from public, anon, authenticated;
revoke execute on function public.category_display_label(text) from public, anon, authenticated;
revoke execute on function public.category_display_order(text) from public, anon, authenticated;
revoke execute on function public.dispatch_import_notification_for_collaborator(uuid, uuid, text, text, text, text, text[], text[], date) from public, anon, authenticated;
revoke execute on function public.notify_collaborators_on_sales_import() from public, anon, authenticated;
