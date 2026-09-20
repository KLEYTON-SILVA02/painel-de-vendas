-- Auto-verificação de categorias por grupo (modelo_catalogo) — pedido do
-- usuário: uma varredura diária, automática, 1h após o fechamento de cada
-- loja, que confere se algum produto vendido hoje ficou com uma categoria
-- diferente da que a Biblioteca Compartilhada do grupo já tem para aquele
-- mesmo nome de produto (ver 0080_catalog_shared_library.sql). Decisão
-- explícita do usuário: NUNCA aplica sozinha — só avisa o ADM pelo sino
-- (mesmo padrão de client_error_reports/password_requests em
-- 0061_notifications_admin_audience.sql), que confirma manualmente em
-- Auditoria > Pendentes ("Sugestão do grupo"), exatamente como já funciona
-- hoje para o resto do mecanismo de biblioteca compartilhada.
--
-- Reaproveita 3 coisas que já existiam: o horário de fechamento por dia da
-- semana + feriado já usado pelo ClosingClock (store_settings.horario/
-- feriados_datas, src/lib/business/horario.ts), o casamento de produto por
-- public.normalize_text (0034_archive_old_sales_cron.sql, mesma função já
-- usada por apply_catalog_correction em 0078), e o padrão de dedupe "só uma
-- vez por dia" de notification_schedules.last_sent_date
-- (0038_notifications_module.sql) — aqui como uma coluna direta em
-- store_settings, já que não existe (nem precisa existir) um agendamento
-- configurável pelo ADM: o horário sai sozinho do horário de fechamento já
-- cadastrado.

alter table public.store_settings
  add column catalog_group_scan_last_date date;

-- Ponto de entrada do pg_cron: roda a cada 15 minutos (folga suficiente
-- para um alvo de "1h depois do fechamento", que não é um horário exato de
-- disparo de notificação ao colaborador). Fuso único assumido, mesma
-- suposição de America/Sao_Paulo já usada em dispatch_sales_notifications e
-- archive_old_sales_for_store.
create or replace function public.run_catalog_group_scan()
returns jsonb
language plpgsql
security definer
set search_path to 'public, extensions'
as $$
declare
  rec record;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  dia_atual text := (array['dom','seg','ter','qua','qui','sex','sab'])[extract(dow from (now() at time zone 'America/Sao_Paulo'))::int + 1];
  hora_atual time := (now() at time zone 'America/Sao_Paulo')::time;
  is_feriado boolean;
  ativo_hoje boolean;
  fecha_hoje time;
  mismatch_count int;
  processed int := 0;
begin
  for rec in
    select s.id as store_id, s.modelo_catalogo, ss.horario, ss.feriados_datas
    from public.stores s
    join public.store_settings ss on ss.store_id = s.id
    where s.status = 'active'
      and s.modelo_catalogo is not null
      and ss.catalog_group_scan_last_date is distinct from hoje
  loop
    is_feriado := hoje = any(rec.feriados_datas);
    if is_feriado then
      ativo_hoje := true;
      fecha_hoje := coalesce((rec.horario->'feriado'->>'fecha')::time, '18:00'::time);
    else
      ativo_hoje := coalesce((rec.horario->dia_atual->>'ativo')::boolean, false);
      fecha_hoje := coalesce((rec.horario->dia_atual->>'fecha')::time, '18:00'::time);
    end if;

    -- Loja fechada hoje (dia sem expediente) — nada a verificar, e não
    -- marca como "já rodou hoje": se abrir depois num feriado cadastrado
    -- tardiamente, por exemplo, o próximo tick ainda reavalia.
    if not ativo_hoje then
      continue;
    end if;

    -- Ainda não passou 1h do fechamento de hoje.
    if hora_atual < (fecha_hoje + interval '1 hour') then
      continue;
    end if;

    select count(*) into mismatch_count
    from (
      select distinct s.produto
      from public.sales s
      join public.catalog_shared_library lib
        on lib.modelo_catalogo = rec.modelo_catalogo
        and lib.nome_normalizado = normalize_text(s.produto)
      where s.store_id = rec.store_id
        and s.data_iso = hoje
        and s.grupo is distinct from lib.categoria
    ) x;

    if mismatch_count > 0 then
      insert into public.notifications (store_id, collaborator_id, audience, title, body, data)
      values (
        rec.store_id,
        null,
        'admin',
        'Sugestões do grupo pendentes',
        format(
          '%s produto(s) vendido(s) hoje têm uma classificação diferente da sugerida pela biblioteca do seu grupo. Confira em ADM > Auditoria > Pendentes.',
          mismatch_count
        ),
        jsonb_build_object('tipo', 'catalog_group_mismatch', 'count', mismatch_count, 'data', hoje)
      );
    end if;

    update public.store_settings set catalog_group_scan_last_date = hoje where store_id = rec.store_id;
    processed := processed + 1;
  end loop;

  return jsonb_build_object('checked_at', now(), 'processed', processed);
end;
$$;

revoke execute on function public.run_catalog_group_scan() from public, anon, authenticated;

-- cron.schedule upserta pelo nome do job, então rodar esta migração de novo
-- é seguro.
select cron.schedule('catalog-group-scan', '*/15 * * * *', $$select public.run_catalog_group_scan();$$);
