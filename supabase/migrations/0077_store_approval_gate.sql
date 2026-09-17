-- Sistema privado, não público/gratuito: o usuário quer aprovar manualmente
-- cada loja nova antes dela ganhar qualquer acesso, e essa aprovação vai
-- acontecer de fora (Monitoramento de Lojas, ver CLAUDE.md — PLANO B), pelo
-- mesmo modelo de "pull" já combinado para aquele sistema.
--
-- A partir de agora, toda loja criada por auto-cadastro (handle_new_admin_user)
-- nasce com status='pending' e fica sem NENHUM acesso até ser aprovada. Lojas
-- já existentes na produção continuam 'active' automaticamente — o default
-- da coluna cobre isso sem precisar de UPDATE em massa nem risco de travar
-- quem já usa o sistema hoje.
--
-- O bloqueio de verdade vive num único ponto: current_store_id(), a função
-- que TODA policy de RLS do sistema já usa (dezenas de tabelas) — nenhuma
-- delas precisa ser tocada individualmente. Uma loja não-active simplesmente
-- deixa de existir para efeitos de current_store_id(), e toda policy que
-- compara `store_id = current_store_id()` passa a não bater com nada.
--
-- Único ajuste fino: sem essa mudança, a própria tabela `stores` também
-- sumiria para um usuário pendente (via a policy `stores_select`, que usa
-- current_store_id()) — e a tela de espera não teria como saber que status
-- mostrar. A policy nova abaixo é puramente aditiva (não troca a original) e
-- só reabre a própria linha de `stores`, nunca as de outra loja.
alter table public.stores
  add column status text not null default 'active' check (status in ('pending', 'active', 'rejected'));

create or replace function public.current_store_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select p.store_id
  from public.profiles p
  join public.stores s on s.id = p.store_id
  where p.id = auth.uid() and s.status = 'active'
$$;

create policy stores_select_own_regardless_of_status on public.stores for select
  using (id = (select store_id from public.profiles where id = auth.uid()));

create or replace function public.handle_new_admin_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_store_id uuid;
begin
  if new.raw_app_meta_data ? 'collaborator_login' or new.email like '%.colaborador.painel.local' then
    return new;
  end if;

  select id into v_store_id from public.stores where admin_email = new.email;

  if v_store_id is null then
    insert into public.stores (admin_email, status)
    values (new.email, 'pending')
    returning id into v_store_id;

    insert into public.store_settings (store_id)
    values (v_store_id)
    on conflict (store_id) do nothing;
  end if;

  insert into public.profiles (id, store_id, role)
  values (new.id, v_store_id, 'admin')
  on conflict (id) do nothing;

  return new;
end;
$function$;
