-- Área de Suporte (Fase 1) — pedido explícito do usuário: ele quer deixar
-- de ser o ADM do dia a dia de uma loja e passar o título para um gerente
-- já cadastrado como colaborador, mantendo sua própria conta pessoal livre
-- para, no futuro (Fase 2, não construída ainda), virar um "Acesso
-- Construtor" — login pessoal + allow-list, sem senha mestre — que dá
-- acesso a qualquer loja. Aqui só a Fase 1: transferir a administração de
-- UMA loja para um colaborador que já tem login.
--
-- Decisão de design (registrada, ver conversa que originou esta migration):
-- promover não mexe em `collaborators` nem em `sales` — o colaborador
-- promovido continua aparecendo em rankings/metas/comissões normalmente,
-- porque esses cálculos usam `collaborators`+`sales` (por matrícula), não
-- `profiles`. A única coisa que muda é o papel de login: `profiles.role`
-- vira 'admin' e `collaborator_id` é zerado (a constraint já existente
-- profiles_collaborator_requires_role exige isso). O ADM antigo perde o
-- profile daquela loja imediatamente — sua conta em auth.users continua
-- existindo, intacta, pronta para virar a semente do Construtor na Fase 2.

create table public.admin_transfers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  from_user_id uuid not null,
  to_user_id uuid not null,
  created_at timestamptz not null default now()
);
create index admin_transfers_store_id_idx on public.admin_transfers(store_id);

alter table public.admin_transfers enable row level security;

-- Só o ADM atual da loja enxerga o histórico dela — inclusive o próprio
-- registro da transferência que acabou de tirar o admin anterior do cargo
-- (ele não vê mais nada da loja depois disso, o que é o comportamento
-- pretendido). Sem policy de insert/update/delete: a única escrita vem da
-- função abaixo, que é security definer e ignora RLS.
create policy admin_transfers_select on public.admin_transfers for select
  using (public.is_admin() and store_id = public.current_store_id());

-- Transfere a administração da loja atual para um colaborador que já tem
-- login (criado antes em ADM > Colaboradores > "🔑 Criar acesso"). Só quem
-- já é admin da loja pode chamar; o alvo precisa ser um profile
-- role='collaborator' da mesma loja. Depois de rodar, quem chamou deixa de
-- ser admin daquela loja (perde o profile) — o cliente deve encerrar a
-- sessão logo em seguida, já que ela não serve mais pra nada nesta loja.
create or replace function public.transfer_administration(p_collaborator_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_store_id uuid := public.current_store_id();
  v_caller_id uuid := auth.uid();
  v_target_profile_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Só o ADM da loja pode transferir a administração.';
  end if;

  select id into v_target_profile_id
  from public.profiles
  where collaborator_id = p_collaborator_id
    and store_id = v_store_id
    and role = 'collaborator';

  if v_target_profile_id is null then
    raise exception 'Esse colaborador não tem acesso ao sistema ainda — crie o acesso dele em Colaboradores antes de transferir.';
  end if;

  update public.profiles
  set role = 'admin', collaborator_id = null
  where id = v_target_profile_id;

  insert into public.admin_transfers (store_id, from_user_id, to_user_id)
  values (v_store_id, v_caller_id, v_target_profile_id);

  delete from public.profiles where id = v_caller_id;
end;
$$;

revoke execute on function public.transfer_administration(uuid) from public, anon;
grant execute on function public.transfer_administration(uuid) to authenticated;
