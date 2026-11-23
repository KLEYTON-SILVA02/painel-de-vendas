-- Backup automático próprio (sem custo extra) — pedido do usuário depois do e-mail
-- do Supabase oferecendo "Recuperação pontual" (PITR, US$ 100/mês).
--
-- O que já protege hoje: o plano Pro faz backup diário completo, guardado por 7 dias
-- (conferir em Database → Backups). Isto aqui é uma segunda camada, dentro do
-- próprio banco, para o cenário que o e-mail descreve: um DROP/DELETE acidental,
-- uma migração mal feita ou um script descontrolado.
--
-- Três cofres, todos em esquemas SEM acesso pela API (nem anon nem authenticated):
--   backup_diario  — cópia de todas as tabelas toda noite às 23:30 (Brasília), em 7
--                    posições que se reaproveitam (d1 = segunda … d7 = domingo): fica
--                    sempre a última semana, sem rotina de limpeza.
--   backup_mensal  — cópia no último dia de cada mês, guarda os 3 últimos. Cobre o
--                    problema descoberto só depois de uma semana.
--   backup_manual  — cópia tirada ANTES de uma migração perigosa (public.backup_manual);
--                    some sozinha depois de 45 dias.
--
-- A cópia noturna roda às 02:30 UTC, ANTES das duas rotinas que apagam dado de
-- propósito (remove-inactive-collaborators, 03:00 UTC, e archive-old-sales-daily,
-- 06:00 UTC) — então até essas exclusões podem ser desfeitas.
--
-- Cada tabela é copiada isolada: se uma falhar, as outras continuam e a cópia antiga
-- daquela tabela é mantida (o erro fica em backup_diario.registro).
-- Fica de fora o que é descartável ou se recria sozinho: notifications,
-- rate_limit_hits, client_error_reports, sales_import_locks, push_tokens.
-- Inclui também os esquemas pvapp e rele (outros apps no mesmo banco), que são pequenos.
-- O esquema auth (logins) já entra no backup diário do Supabase e não é copiado aqui.

create schema if not exists backup_diario;
create schema if not exists backup_mensal;
create schema if not exists backup_manual;
revoke all on schema backup_diario, backup_mensal, backup_manual from public, anon, authenticated;

create table if not exists backup_diario.registro (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('diario', 'mensal', 'manual')),
  rotulo text not null,
  esquema_origem text not null,
  tabela text not null,
  destino text not null,
  linhas bigint,
  erro text,
  gravado_em timestamptz not null default now()
);
create index if not exists backup_registro_tipo_idx on backup_diario.registro (tipo, rotulo);
alter table backup_diario.registro enable row level security;
revoke all on backup_diario.registro from public, anon, authenticated;

-- Copia UMA tabela para o cofre. Nunca propaga erro: registra e segue.
create or replace function public._backup_copiar_tabela(
  p_tipo text, p_rotulo text, p_destino_schema text, p_sufixo text, p_esquema text, p_tabela text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_nome text := case when p_esquema = 'public' then p_tabela else p_esquema || '__' || p_tabela end || p_sufixo;
  v_destino text;
  v_n bigint;
begin
  v_destino := format('%I.%I', p_destino_schema, v_nome);
  begin
    if length(v_nome) > 63 then
      raise exception 'nome da cópia longo demais: %', v_nome;
    end if;
    execute format('drop table if exists %s', v_destino);
    execute format('create table %s as table %I.%I', v_destino, p_esquema, p_tabela);
    execute format('select count(*) from %s', v_destino) into v_n;
    execute format('alter table %s enable row level security', v_destino);
    execute format('revoke all on table %s from public, anon, authenticated', v_destino);
    delete from backup_diario.registro
      where tipo = p_tipo and rotulo = p_rotulo and esquema_origem = p_esquema and tabela = p_tabela;
    insert into backup_diario.registro (tipo, rotulo, esquema_origem, tabela, destino, linhas)
      values (p_tipo, p_rotulo, p_esquema, p_tabela, v_destino, v_n);
  exception when others then
    -- a sub-transação desfaz o drop/create desta tabela: a cópia anterior continua intacta
    insert into backup_diario.registro (tipo, rotulo, esquema_origem, tabela, destino, linhas, erro)
      values (p_tipo, p_rotulo, p_esquema, p_tabela, v_destino, null, sqlerrm);
  end;
end;
$$;

create or replace function public.executar_backup_diario()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_rotulo text := 'd' || extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int;
  v_mes text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYYMM');
  v_ultimo_dia boolean := (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date = v_hoje;
  v_excluidas constant text[] := array['notifications', 'rate_limit_hits', 'client_error_reports', 'sales_import_locks', 'push_tokens'];
  r record;
  m record;
begin
  for r in
    select schemaname, tablename from pg_tables
    where schemaname in ('public', 'pvapp', 'rele')
      and not (schemaname = 'public' and tablename = any (v_excluidas))
    order by schemaname, tablename
  loop
    perform public._backup_copiar_tabela('diario', v_rotulo, 'backup_diario', '_' || v_rotulo, r.schemaname, r.tablename);
    if v_ultimo_dia then
      perform public._backup_copiar_tabela('mensal', v_mes, 'backup_mensal', '_' || v_mes, r.schemaname, r.tablename);
    end if;
  end loop;

  -- guarda só os 3 últimos meses
  for m in select distinct rotulo from backup_diario.registro where tipo = 'mensal' order by rotulo desc offset 3 loop
    for r in select destino from backup_diario.registro where tipo = 'mensal' and rotulo = m.rotulo loop
      execute 'drop table if exists ' || r.destino;
    end loop;
    delete from backup_diario.registro where tipo = 'mensal' and rotulo = m.rotulo;
  end loop;

  -- cópias manuais somem depois de 45 dias
  for r in select id, destino from backup_diario.registro where tipo = 'manual' and gravado_em < now() - interval '45 days' loop
    execute 'drop table if exists ' || r.destino;
    delete from backup_diario.registro where id = r.id;
  end loop;

  return jsonb_build_object(
    'rotulo', v_rotulo,
    'mensal', case when v_ultimo_dia then v_mes end,
    'tabelas_ok', (select count(*) from backup_diario.registro where tipo = 'diario' and rotulo = v_rotulo and erro is null),
    'tabelas_com_erro', (select count(*) from backup_diario.registro where tipo = 'diario' and rotulo = v_rotulo and erro is not null)
  );
end;
$$;

-- Cópia sob demanda, para tirar ANTES de uma migração que apaga/altera dados.
-- Ex.: select public.backup_manual('antes_limpeza_x', array['sales', 'catalog']);
create or replace function public.backup_manual(p_rotulo text, p_tabelas text[])
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t text;
begin
  if p_rotulo !~ '^[a-z0-9_]{1,30}$' then
    raise exception 'rótulo inválido: use só a-z, 0-9 e _ (até 30 caracteres)';
  end if;
  if p_tabelas is null or cardinality(p_tabelas) = 0 then
    raise exception 'informe as tabelas a copiar';
  end if;
  foreach t in array p_tabelas loop
    if to_regclass(format('public.%I', t)) is null then
      raise exception 'a tabela public.% não existe', t;
    end if;
    perform public._backup_copiar_tabela('manual', p_rotulo, 'backup_manual', '__' || p_rotulo, 'public', t);
  end loop;
  return jsonb_build_object(
    'rotulo', p_rotulo,
    'copias', (select coalesce(jsonb_agg(jsonb_build_object('tabela', tabela, 'linhas', linhas, 'erro', erro)), '[]'::jsonb)
               from backup_diario.registro where tipo = 'manual' and rotulo = p_rotulo)
  );
end;
$$;

-- Para a tela Backup mostrar "último backup automático". Só ADM; devolve só a data/hora.
create or replace function public.ultimo_backup_automatico()
returns timestamptz
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case when public.is_admin()
    then (select max(gravado_em) from backup_diario.registro where tipo = 'diario' and erro is null)
  end;
$$;

revoke execute on function public._backup_copiar_tabela(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.executar_backup_diario() from public, anon, authenticated;
revoke execute on function public.backup_manual(text, text[]) from public, anon, authenticated;
revoke execute on function public.ultimo_backup_automatico() from public, anon;
grant execute on function public.ultimo_backup_automatico() to authenticated;

-- cron.schedule upserta pelo nome do job: rodar esta migração de novo não duplica.
select cron.schedule('backup-diario', '30 2 * * *', $$select public.executar_backup_diario();$$);

-- O histórico das próprias rotinas agendadas (cron.job_run_details) crescia sem limite:
-- 70 MB só disso, com jobs que rodam a cada 2 e 5 minutos. Guarda 7 dias.
select cron.schedule('limpar-historico-cron', '15 5 * * *', $$delete from cron.job_run_details where end_time < now() - interval '7 days';$$);
