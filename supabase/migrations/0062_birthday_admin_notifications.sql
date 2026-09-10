-- "OUTRAS MENSAGENS NO DESKTOP" — quando a data de aniversário cadastrada
-- de um colaborador (collaborators.data_nascimento, migration 0031) cai
-- hoje, o ADM recebe uma notificação (audience='admin', ver migration
-- 0061) personalizada com o nome do colaborador. O card temático com
-- confetes + chuva de balões que aparece automaticamente na tela (como o
-- card de campeão) é inteiramente client-side — ver
-- src/components/BirthdayCelebration.tsx — e não depende desta notificação
-- para funcionar; esta função só alimenta o sino/tela de notificações do
-- ADM com um registro datado, como pedido.
--
-- Roda uma vez por dia (não a cada 2 minutos como o dispatcher de push) —
-- aniversário não é um evento que precise de latência baixa, e checar a
-- cada 2 minutos só multiplicaria trabalho sem motivo. O horário (10:00
-- UTC = 07:00 America/Sao_Paulo) é só "de manhã, antes da loja abrir";
-- ajustável depois se o cliente pedir outro horário.
create or replace function public.notify_admin_birthdays()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r record;
begin
  for r in
    select c.id, c.nome, c.apelido, c.store_id
    from public.collaborators c
    where c.data_nascimento is not null
      and extract(month from c.data_nascimento) = extract(month from hoje)
      and extract(day from c.data_nascimento) = extract(day from hoje)
  loop
    -- Idempotente: não duplica se a função rodar mais de uma vez no mesmo
    -- dia (reexecução manual, por exemplo).
    if not exists (
      select 1 from public.notifications n
      where n.audience = 'admin'
        and n.store_id = r.store_id
        and n.data->>'kind' = 'birthday'
        and n.data->>'collaborator_id' = r.id::text
        and (n.created_at at time zone 'America/Sao_Paulo')::date = hoje
    ) then
      insert into public.notifications (store_id, collaborator_id, audience, title, body, data)
      values (
        r.store_id,
        null,
        'admin',
        'Aniversário hoje 🎂',
        coalesce(r.apelido, r.nome) || ' faz aniversário hoje!',
        jsonb_build_object('kind', 'birthday', 'collaborator_id', r.id)
      );
    end if;
  end loop;
end;
$$;

select cron.schedule(
  'notify-admin-birthdays',
  '0 10 * * *',
  $$ select public.notify_admin_birthdays(); $$
);
