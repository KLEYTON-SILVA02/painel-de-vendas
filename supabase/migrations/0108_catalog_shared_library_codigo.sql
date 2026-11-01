-- Estende a Biblioteca Compartilhada (catalog_shared_library, migration
-- 0080) pra também carregar o código do produto, não só a categoria —
-- pedido explícito do usuário, 2026-11-01, depois de confirmar com dados
-- reais que o código BATE entre as lojas do grupo rede_extrafarma_pague_menos
-- em 99,94% dos casos (5.179 de 5.182 produtos em comum entre as duas lojas
-- hoje ativas no grupo) — ou seja, dentro de um mesmo modelo_catalogo o
-- código é, na prática, um identificador de rede, não um número inventado
-- por loja. Mesmo princípio de sempre: nenhuma loja nunca escreve nem lê a
-- linha de outro grupo, só este pool neutro compartilhado.
alter table public.catalog_shared_library add column codigo text;

-- Completa a propagação automática já existente (0082): quando uma loja do
-- grupo classifica um produto NOVO que as lojas irmãs ainda não têm, elas já
-- ganham a mesma linha no próprio Catálogo automaticamente (sem precisar de
-- venda nem confirmação — decisão já tomada e em produção desde a 0082).
-- Essa inserção automática gravava codigo como null sempre; agora carrega o
-- código também, quando disponível — é a MESMA escrita automática que já
-- acontecia, só completando o dado que ela já tinha o direito de gravar.
--
-- Importante: isto NÃO estende a automação pra produtos que a loja irmã JÁ
-- TEM cadastrados (o "not exists" abaixo continua intacto, idêntico à
-- 0082) — preencher o código de um produto já existente, só faltando
-- código, continua exigindo confirmação manual do ADM da loja que recebe
-- (ver painel novo em Produtos > Catálogo), nunca é escrito sozinho por
-- este gatilho.
create or replace function public.propagate_catalog_shared_library()
returns trigger
language plpgsql
security definer
set search_path to 'public, extensions'
as $$
begin
  insert into public.catalog (store_id, nome, codigo, categoria, origem)
  select s.id, new.nome, new.codigo, new.categoria, 'multilojas'
  from public.stores s
  where s.modelo_catalogo = new.modelo_catalogo
    and s.status = 'active'
    and not exists (
      select 1 from public.catalog c
      where c.store_id = s.id and public.normalize_text(c.nome) = new.nome_normalizado
    );
  return new;
end;
$$;
