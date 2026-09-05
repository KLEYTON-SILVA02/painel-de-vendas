-- Módulo de Notificações — Etapa 1b: a função que decide "está na hora de
-- mandar?" e calcula o que cada colaborador vendeu HOJE, em cada categoria
-- (mesmas regras de classificação já usadas no arquivamento — grupo direto
-- pra DERM/GEN/MP/MER, keyword match pra LEVMEL/CHIP, classify_bio pra
-- BIOSINTÉTICA G1-G4). Só GRAVA a notificação como pendente
-- (notifications.sent_at fica null) — quem efetivamente entrega via push é
-- a Edge Function da Etapa 1c, separada porque autenticar com o FCM exige
-- um token OAuth bem mais simples de obter em TypeScript/Deno do que em
-- PL/pgSQL puro.
--
-- Horário do agendamento é sempre interpretado como horário de Brasília
-- (America/Sao_Paulo) — mesma suposição de fuso único já usada em
-- archive_old_sales_cron. O período coberto é sempre "hoje" (reinicia a
-- cada dia); se um dia isso precisar virar configurável (dia/mês), dá pra
-- acrescentar uma coluna `periodo` em notification_schedules sem quebrar
-- nada que já existe.

-- to_char()'s G/D format codes depend on the database's locale, which can
-- render thousands/decimal separators the wrong way round for a Brazilian
-- amount — this builds "R$ 1.234,56" by hand instead, so the text is
-- correct regardless of how the server is configured.
create or replace function public.format_money_brl(v numeric)
returns text
language plpgsql
immutable
as $$
declare
  cents bigint := round(coalesce(v, 0) * 100);
  negative boolean := cents < 0;
  int_part text;
  formatted text := '';
  i int;
  len int;
begin
  cents := abs(cents);
  int_part := (cents / 100)::text;
  len := length(int_part);
  for i in 1..len loop
    formatted := formatted || substr(int_part, i, 1);
    if (len - i) > 0 and (len - i) % 3 = 0 then
      formatted := formatted || '.';
    end if;
  end loop;
  return (case when negative then '-' else '' end) || 'R$ ' || formatted || ',' || lpad((cents % 100)::text, 2, '0');
end;
$$;

-- Calcula e grava a notificação pendente de um colaborador para um
-- agendamento que acabou de vencer.
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
begin
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
      cross join lateral (select public.classify_bio(s.produto, store_id_param) as bio_group) c
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

-- Um agendamento por vez: soma os keywords de LEVMEL/CHIP da loja uma
-- única vez e chama a função acima pra cada colaborador cadastrado.
create or replace function public.dispatch_sales_notifications_for_schedule(schedule_row public.notification_schedules)
returns void
language plpgsql
as $$
declare
  levmel_keywords text[];
  chip_keywords text[];
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  colaborador record;
begin
  select coalesce(array_agg(kw), '{}') into levmel_keywords
  from public.special_lists sl, lateral unnest(case when coalesce(array_length(sl.palavras, 1), 0) > 0 then sl.palavras else array[sl.nome] end) as kw
  where sl.store_id = schedule_row.store_id and sl.tipo = 'levmel';

  select coalesce(array_agg(kw), '{}') into chip_keywords
  from public.special_lists sl, lateral unnest(case when coalesce(array_length(sl.palavras, 1), 0) > 0 then sl.palavras else array[sl.nome] end) as kw
  where sl.store_id = schedule_row.store_id and sl.tipo = 'chip';

  for colaborador in select id, matricula from public.collaborators where store_id = schedule_row.store_id loop
    perform public.dispatch_sales_notification_for_collaborator(
      schedule_row.store_id, colaborador.id, colaborador.matricula, levmel_keywords, chip_keywords, hoje
    );
  end loop;
end;
$$;

-- Ponto de entrada do pg_cron: roda a cada 5 minutos, verifica quais
-- agendamentos ativos "venceram" (hora já passou, dia da semana bate, e
-- ainda não foi disparado hoje) e processa cada um.
create or replace function public.dispatch_sales_notifications()
returns jsonb
language plpgsql
as $$
declare
  schedule public.notification_schedules;
  dia_atual text;
  hora_atual time;
  data_atual date;
  processed int := 0;
begin
  dia_atual := (array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'])[extract(dow from (now() at time zone 'America/Sao_Paulo'))::int + 1];
  hora_atual := (now() at time zone 'America/Sao_Paulo')::time;
  data_atual := (now() at time zone 'America/Sao_Paulo')::date;

  for schedule in
    select * from public.notification_schedules
    where ativo
      and hora <= hora_atual
      and last_sent_date is distinct from data_atual
      and dias ? dia_atual
  loop
    perform public.dispatch_sales_notifications_for_schedule(schedule);
    update public.notification_schedules set last_sent_date = data_atual where id = schedule.id;
    processed := processed + 1;
  end loop;

  return jsonb_build_object('checked_at', now(), 'processed', processed);
end;
$$;

-- Mesmo endurecimento de acesso já aplicado às funções de arquivamento —
-- nenhuma dessas tem chamador legítimo fora do próprio cron.
revoke execute on function public.format_money_brl(numeric) from public, anon, authenticated;
revoke execute on function public.dispatch_sales_notification_for_collaborator(uuid, uuid, text, text[], text[], date) from public, anon, authenticated;
revoke execute on function public.dispatch_sales_notifications_for_schedule(public.notification_schedules) from public, anon, authenticated;
revoke execute on function public.dispatch_sales_notifications() from public, anon, authenticated;

-- cron.schedule upserta pelo nome do job, então rodar esta migração de novo
-- é seguro.
select cron.schedule('dispatch-sales-notifications', '*/5 * * * *', $$select public.dispatch_sales_notifications();$$);
