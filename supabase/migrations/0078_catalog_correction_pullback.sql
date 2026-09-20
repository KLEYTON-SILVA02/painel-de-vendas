-- PLANO B (MONITORAMENTO DE LOJAS) — o único caminho de escrita que o
-- Monitoramento tem de volta para este projeto: aplicar uma correção de
-- categoria decidida lá (dentro de um grupo de lojas do mesmo
-- modelo_catalogo) em todas as lojas daquele grupo aqui, reaproveitando a
-- mesma lógica de duas partes que useReclassifyProdutos já usa em
-- Auditoria (upsert em catalog + retroagir sales.grupo) — só que rodando
-- server-side, sem sessão de admin, para todas as lojas do grupo de uma
-- vez. Chamada pela Edge Function apply-monitoramento-correcoes (via
-- service role), nunca diretamente por um cliente autenticado.
--
-- O casamento de produto precisa ser o mesmo normalize() (case/acento/
-- espaço-insensível) que o classificador e useReclassifyProdutos já usam,
-- mas em SQL, para não precisar trazer sales inteiras para a Edge Function
-- e comparar em JS (uma loja pode ter milhões de linhas de venda; fazer
-- isso em SQL mantém a operação num único UPDATE set-based por loja).
-- public.normalize_text já existe (migration 0034_archive_old_sales_cron.sql,
-- mesmo raciocínio, criada para o archival) — reaproveitada aqui como está,
-- sem redefinir.

-- Trilha de auditoria: toda correção efetivamente aplicada por esta rotina
-- fica registrada aqui, por loja — decisão tomada nesta sessão em vez de
-- uma etapa de revisão manual antes de aplicar (o modelo de propagação já
-- combinado é "aplica automaticamente"; a segurança extra vem de só casar
-- produtos dentro do mesmo grupo de modelo_catalogo, mais este log
-- ficar visível para o próprio ADM da loja depois do fato). Sem policy de
-- insert/update/delete: só apply_catalog_correction (security definer)
-- escreve aqui, nunca um cliente direto.
create table public.catalog_correction_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  modelo_catalogo text not null,
  produto text not null,
  categoria text not null check (categoria in ('DERM', 'GEN', 'MP', 'MER')),
  vendas_afetadas integer not null default 0,
  aplicado_em timestamptz not null default now()
);
create index catalog_correction_log_store_idx on public.catalog_correction_log(store_id);
alter table public.catalog_correction_log enable row level security;
create policy catalog_correction_log_select on public.catalog_correction_log for select
  using (public.is_admin() and store_id = public.current_store_id());

-- Aplica UMA correção (produto + categoria alvo) em todas as lojas do
-- modelo_catalogo informado. Retorna o total de linhas de sales
-- retroagidas (soma entre lojas), só para a Edge Function logar um
-- resumo — o efeito real já fica registrado por loja em
-- catalog_correction_log.
create or replace function public.apply_catalog_correction(
  p_modelo_catalogo text,
  p_produto text,
  p_categoria text
)
returns integer
language plpgsql
security definer
-- 'extensions' precisa estar no search_path porque normalize_text (definida
-- em 0034_archive_old_sales_cron.sql, sem search_path próprio) chama
-- unaccent(), instalada nesse schema — sem isso a resolução falha dentro de
-- uma security definer function, que não herda o search_path de sessão
-- default do Supabase como archive_old_sales_for_store (não-definer) faz.
set search_path to 'public, extensions'
as $$
declare
  v_store record;
  v_existing_id uuid;
  v_sales_updated integer;
  v_total integer := 0;
begin
  if p_categoria not in ('DERM', 'GEN', 'MP', 'MER') then
    raise exception 'categoria inválida: %', p_categoria;
  end if;

  -- status = 'active' exclui lojas pendentes/rejeitadas do gate de
  -- aprovação (0077_store_approval_gate.sql, mesma sessão que introduziu
  -- essa coluna) — uma loja sem acesso próprio não deve ganhar catálogo/
  -- vendas reescritos por uma correção automática vinda de fora.
  for v_store in select id from public.stores where modelo_catalogo = p_modelo_catalogo and status = 'active' loop
    select id into v_existing_id from public.catalog
      where store_id = v_store.id and normalize_text(nome) = normalize_text(p_produto)
      limit 1;

    if v_existing_id is not null then
      update public.catalog set categoria = p_categoria where id = v_existing_id;
    else
      insert into public.catalog (store_id, nome, codigo, categoria)
      values (v_store.id, p_produto, null, p_categoria);
    end if;

    with updated as (
      update public.sales
      set grupo = p_categoria
      where store_id = v_store.id and normalize_text(produto) = normalize_text(p_produto)
      returning 1
    )
    select count(*) into v_sales_updated from updated;

    insert into public.catalog_correction_log (store_id, modelo_catalogo, produto, categoria, vendas_afetadas)
    values (v_store.id, p_modelo_catalogo, p_produto, p_categoria, v_sales_updated);

    v_total := v_total + v_sales_updated;
  end loop;

  return v_total;
end;
$$;

-- Sem grant a authenticated/anon de propósito: só service_role chama isso
-- (via a Edge Function apply-monitoramento-correcoes), nunca um cliente
-- logado do app — a função reescreve sales/catalog de TODAS as lojas de um
-- grupo, muito além do que qualquer RLS de um único ADM permitiria.
revoke execute on function public.apply_catalog_correction(text, text, text) from public, anon, authenticated;
