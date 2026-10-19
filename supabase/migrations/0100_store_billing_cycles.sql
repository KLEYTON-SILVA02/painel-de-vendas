-- Ciclo de uso por loja (planejamento feito nesta sessão, artefato "Ciclo de
-- Uso e Suspensão por Loja") — stopgap temporário até o Monitoramento de
-- Lojas existir (PLANO B, ver CLAUDE.md). Decisão explícita tomada com o
-- usuário: Opção B — o bloqueio NUNCA toca em `stores.status`/
-- `current_store_id()` (a função central usada por toda a RLS do sistema).
-- Em vez disso, esta tabela só guarda o histórico de ciclos; "bloqueado" é
-- sempre calculado no momento da leitura (client-side, ver
-- src/lib/business/billingCycle.ts), nunca escrito por uma rotina
-- automática — não existe aqui nenhum cron, nenhuma coluna "status" nova em
-- `stores`, nenhuma mudança em nenhuma policy já existente. O raio de dano
-- de qualquer bug nesta função fica limitado a esta tabela e à tela que a
-- usa, nunca ao resto do sistema.
--
-- Histórico: cada "iniciar ciclo" ou "renovar ciclo" é sempre uma linha
-- NOVA (nunca um update) — sem policy de update nem de delete, a tabela é
-- imposta como somente-inserção pelo próprio RLS, não só por convenção de
-- código.
create table public.store_billing_cycles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cycle_type text not null check (cycle_type in ('30', '60', '90', '365')),
  started_at date not null,
  ends_at date not null,
  confirmed_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index store_billing_cycles_store_id_idx on public.store_billing_cycles(store_id, ends_at desc);
alter table public.store_billing_cycles enable row level security;

-- A própria loja lê seu próprio histórico (para o ícone de contagem na Tela
-- Inicial e para o aviso de bloqueio no AppShell); o ADM CONSTRUTOR lê de
-- todas as lojas (para a tela cross-loja). Nenhuma das duas depende de
-- `stores.status` — current_store_id() já exige status='active' por conta
-- própria, então uma loja 'pending'/'rejected' continua sem acesso nenhum
-- aqui, sem precisar repetir essa checagem.
create policy store_billing_cycles_select on public.store_billing_cycles for select
  using (store_id = current_store_id() or is_platform_builder());

-- Só o ADM CONSTRUTOR cria ciclos (iniciar ou renovar) — nunca a própria
-- loja. Sem policy de update/delete: uma vez inserida, uma linha nunca é
-- alterada nem removida por ninguém através do cliente.
create policy store_billing_cycles_insert_builder on public.store_billing_cycles for insert
  with check (is_platform_builder());

-- Lista todas as lojas com o ciclo de uso mais recente de cada uma, para a
-- tela cross-loja do ADM CONSTRUTOR (/construtor) — mesmo padrão de
-- list_stores_for_builder (migration 0072): só devolve algo quando
-- is_platform_builder() é verdadeiro, e nunca para quem não está na
-- allow-list.
create or replace function public.list_stores_billing_for_builder()
returns table (
  store_id uuid,
  nome_loja text,
  numero_loja text,
  status text,
  cycle_type text,
  started_at date,
  ends_at date
)
language sql stable security definer set search_path = public as $$
  select s.id, s.nome_loja, s.numero_loja, s.status, c.cycle_type, c.started_at, c.ends_at
  from public.stores s
  left join lateral (
    select b.cycle_type, b.started_at, b.ends_at
    from public.store_billing_cycles b
    where b.store_id = s.id
    order by b.ends_at desc
    limit 1
  ) c on true
  where public.is_platform_builder()
  order by s.numero_loja
$$;
revoke execute on function public.list_stores_billing_for_builder() from public, anon;
grant execute on function public.list_stores_billing_for_builder() to authenticated;
