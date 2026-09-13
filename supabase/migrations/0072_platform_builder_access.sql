-- Área de Suporte (Fase 2) — "Acesso Construtor": o usuário (ADM-Construtor
-- do sistema, dono da plataforma) quer poder entrar em QUALQUER loja com a
-- própria conta pessoal (o mesmo email/senha de sempre), sem senha mestre
-- compartilhada — decisão já tomada em conversa anterior. Esta migration só
-- cobre o acesso em si (entrar numa loja, trocar de loja, sair); o fluxo de
-- "pedido de autorização remota" + bloqueio de tela para outros usuários no
-- desktop fica para uma fase futura (exige infraestrutura de tempo real que
-- este sistema não tem hoje — tudo aqui é por polling).
--
-- Desenho: em vez de inventar um mecanismo de sessão paralelo (JWT com
-- claims extras, tabela de "contexto ativo" lida por current_store_id(),
-- etc.), a entrada do Construtor numa loja simplesmente reaproveita
-- `profiles`: sua própria conta ganha (ou tem atualizado) um profile
-- role='admin' apontando para a loja escolhida. Como TODA a RLS do sistema
-- já é `is_admin() and store_id = current_store_id()`, e essas duas funções
-- só leem `profiles`, o Construtor passa a enxergar exatamente o que
-- qualquer ADM daquela loja enxergaria — sem tocar em nenhuma das ~130
-- políticas de RLS já existentes, e sem exigir nenhuma mudança nas telas
-- do ADM (o app inteiro já funciona a partir de profiles.store_id). Sair de
-- uma loja é só apagar esse profile; trocar de loja é só apontá-lo para
-- outra. O acesso concreto (quem pode chamar essas funções) é controlado
-- por uma allow-list separada (`platform_builders`), sem policy alguma de
-- leitura/escrita pelo cliente — só eu insiro linhas nela, via SQL direto,
-- exatamente como o conteúdo de `tutorials`.

create table public.platform_builders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);
alter table public.platform_builders enable row level security;
-- Sem nenhuma policy: ninguém lê/escreve esta tabela pelo cliente, nem o
-- próprio construtor — a única forma de consultar "sou eu?" é a função
-- is_platform_builder() abaixo, que não revela a lista inteira.

-- Log de auditoria: toda entrada/troca de loja pelo Construtor fica
-- registrada, para sempre ser possível responder "quem mexeu em qual loja
-- e quando". Cada construtor só lê o próprio histórico (não que haja UI
-- para isso ainda, mas não custa deixar pronto).
create table public.builder_store_switches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  switched_at timestamptz not null default now()
);
create index builder_store_switches_user_id_idx on public.builder_store_switches(user_id);
alter table public.builder_store_switches enable row level security;
create policy builder_store_switches_select on public.builder_store_switches for select
  using (user_id = auth.uid());

create or replace function public.is_platform_builder()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.platform_builders where user_id = auth.uid())
$$;
revoke execute on function public.is_platform_builder() from public, anon;
grant execute on function public.is_platform_builder() to authenticated;

-- Lista as lojas existentes (id/nome/número) para o Construtor escolher
-- onde entrar — só quem está na allow-list vê isso; um ADM comum não tem
-- motivo nenhum para enumerar lojas de outros clientes.
create or replace function public.list_stores_for_builder()
returns table (id uuid, nome_loja text, numero_loja text)
language sql stable security definer set search_path = public as $$
  select s.id, s.nome_loja, s.numero_loja
  from public.stores s
  where public.is_platform_builder()
  order by s.numero_loja
$$;
revoke execute on function public.list_stores_for_builder() from public, anon;
grant execute on function public.list_stores_for_builder() to authenticated;

-- Entra (ou troca) numa loja como ADM, para quem está na allow-list.
-- Idempotente: chamar de novo com a mesma loja não faz mal. A troca de
-- loja é instantânea e exclusiva — o construtor nunca fica "em duas lojas
-- ao mesmo tempo": assim que o profile aponta pra loja B, o acesso à loja
-- A desaparece por completo (mesma garantia de isolamento que qualquer
-- outro ADM já tem).
create or replace function public.enter_store_as_builder(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_builder() then
    raise exception 'Acesso Construtor não habilitado para esta conta.';
  end if;
  if not exists (select 1 from public.stores where id = p_store_id) then
    raise exception 'Loja não encontrada.';
  end if;

  insert into public.profiles (id, store_id, role, collaborator_id)
  values (auth.uid(), p_store_id, 'admin', null)
  on conflict (id) do update
    set store_id = excluded.store_id, role = 'admin', collaborator_id = null;

  insert into public.builder_store_switches (user_id, store_id) values (auth.uid(), p_store_id);
end;
$$;
revoke execute on function public.enter_store_as_builder(uuid) from public, anon;
grant execute on function public.enter_store_as_builder(uuid) to authenticated;

-- Sai do modo Construtor: remove o profile atual, voltando ao estado
-- "autenticado, sem loja" — a tela de seleção de loja volta a aparecer.
create or replace function public.exit_builder_session()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_builder() then
    raise exception 'Acesso Construtor não habilitado para esta conta.';
  end if;
  delete from public.profiles where id = auth.uid();
end;
$$;
revoke execute on function public.exit_builder_session() from public, anon;
grant execute on function public.exit_builder_session() to authenticated;
