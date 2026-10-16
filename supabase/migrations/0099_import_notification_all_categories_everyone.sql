-- Follow-up to 0098: that migration fixed the "RESUMO DE VENDAS ATUALIZADO"
-- notification to always list every category in the collaborator's own
-- setor (sector_base_categories), zero-filled, instead of only categories
-- with a sale that day. The user then asked for a bigger change: every
-- collaborator should see EVERY category (DERM/GEN/MP/MER/LEVMEL/CHIP),
-- not just the ones their setor normally sells — no more per-setor
-- restriction for this notification at all.
--
-- Confirmed in production data (notifications already sent after 0098)
-- that the setor-based filtering was working exactly as designed — a
-- "Caixa" collaborator's notification correctly had no GEN row, since
-- sector_base_categories('Caixa') doesn't include it. That's the behavior
-- being removed here, per explicit request.
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
    -- Todas as 6 categorias fixas, pra todo colaborador — não mais
    -- restrito às categorias do setor dele (sector_base_categories).
    select a.categoria, coalesce(t.valor_total, 0) as valor_total, coalesce(t.qtd_total, 0) as qtd_total
    from unnest(array['DERM', 'GEN', 'MP', 'MER', 'LEVMEL', 'CHIP']) as a(categoria)
    left join totals t on t.categoria = a.categoria
  loop
    if rec.categoria in ('LEVMEL', 'CHIP') then
      categorias := categorias || jsonb_build_object(rec.categoria, rec.qtd_total::text || ' un.');
    else
      categorias := categorias || jsonb_build_object(rec.categoria, public.format_money_brl(rec.valor_total));
      total := total + rec.valor_total;
    end if;
  end loop;

  -- Categorias genéricas (ex.: Biosintética) continuam restritas à própria
  -- elegibilidade configurada pelo ADM (category_types.setores_elegiveis)
  -- — mecanismo diferente do sector_base_categories removido acima, e fora
  -- do que foi pedido aqui.
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
