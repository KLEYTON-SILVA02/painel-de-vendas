-- Causa raiz confirmada de vendas duplicadas em produção, 2026-11-01: duas
-- confirmações de "Importar Vendas" (ex.: duas abas, dois dispositivos, ou
-- confirmar de novo achando que travou) rodando quase ao mesmo tempo — cada
-- uma checa "isso já existe?" contra o banco antes de qualquer uma ter
-- gravado algo, nenhuma enxerga a outra, as duas gravam o mesmo conjunto de
-- vendas inteiro. Confirmado num caso real: 758 vendas da loja SHOPPING
-- BOULEVARD em 31/10/2026 gravadas duas vezes (R$ 30.972,53 duplicados),
-- corrigido manualmente nessa sessão depois de auditar o banco.
--
-- Trava por loja no próprio banco (não só em memória do navegador, que não
-- cobriria duas abas/dispositivos) — handleConfirm (ImportarPage.tsx) só
-- entra na etapa de gravação depois de conseguir a trava, e a libera ao
-- terminar (sucesso, erro ou bloqueio por data). `token` garante que uma
-- tentativa só libera a trava que ELA MESMA tomou — se a trava já tinha
-- ficado velha (>10 min, ex.: aba fechada no meio do processo) e outra
-- tentativa já tomou posse dela de novo, a liberação antiga vira um no-op
-- em vez de derrubar a trava de quem está rodando agora.
create table public.sales_import_locks (
  store_id uuid primary key references public.stores(id) on delete cascade,
  locked_at timestamptz not null default now(),
  token uuid not null default gen_random_uuid()
);

alter table public.sales_import_locks enable row level security;

create policy sales_import_locks_select on public.sales_import_locks for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy sales_import_locks_insert_admin on public.sales_import_locks for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy sales_import_locks_update_admin on public.sales_import_locks for update
  using (public.is_admin() and store_id = public.current_store_id())
  with check (public.is_admin() and store_id = public.current_store_id());
create policy sales_import_locks_delete_admin on public.sales_import_locks for delete
  using (public.is_admin() and store_id = public.current_store_id());

-- Tenta tomar a trava da loja: insere se não existir, ou retoma se a
-- existente já passou de 10 minutos (tentativa anterior travada/abandonada
-- — uma importação real nunca leva isso). `on conflict ... do update ...
-- where` é atômico: se a trava existente ainda está fresca, a condição do
-- where falha, a atualização não acontece e a CTE não retorna linha — duas
-- chamadas concorrentes nunca conseguem as duas "true" pro mesmo store_id,
-- mesmo chegando no mesmo instante (é o próprio Postgres que serializa,
-- não uma checagem feita em JS antes do insert). Devolve o token da trava
-- quando consegue, null quando não consegue.
create or replace function public.try_acquire_sales_import_lock(p_store_id uuid)
returns uuid
language sql
set search_path = public
as $$
  with acquired as (
    insert into public.sales_import_locks (store_id, locked_at, token)
    values (p_store_id, now(), gen_random_uuid())
    on conflict (store_id) do update
      set locked_at = now(), token = gen_random_uuid()
      where public.sales_import_locks.locked_at < now() - interval '10 minutes'
    returning token
  )
  select token from acquired;
$$;
