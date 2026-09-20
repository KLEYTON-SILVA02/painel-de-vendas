-- Propagação automática da Biblioteca Compartilhada (catalog_shared_library,
-- migration 0080) direto para o Catálogo (Tier 1) das lojas irmãs do mesmo
-- modelo_catalogo — pedido do usuário para Loja 7152 (Shopping Boulevard) e
-- 7035 (Extrafarma Gentil Bittencourt), ambas rede_extrafarma_pague_menos.
--
-- Diferente da sugestão em Auditoria > Pendentes (0080) e da varredura
-- noturna que só avisa (run_catalog_group_scan, 0081) — as duas exigem que a
-- própria loja já tenha alguma venda do produto para aparecer algo — este
-- mecanismo garante a identidade do produto ANTES da primeira venda: assim
-- que qualquer loja do grupo classifica um produto (useReclassifyProdutos ou
-- a nova aba "Da Lista de Vendas" em Produtos > Catálogo), as lojas irmãs já
-- ganham a mesma linha no próprio Catálogo, mesmo sem nenhuma venda ainda.
--
-- Nunca sobrescreve: só insere quando a loja de destino ainda não tem
-- nenhuma linha com esse nome normalizado no próprio Catálogo — uma
-- classificação manual já feita ali (mesmo que diferente) sempre prevalece,
-- exatamente como pedido ("nunca sobrescreve um produto que a loja irmã já
-- tenha cadastrado com outra categoria").

alter table public.catalog drop constraint catalog_origem_check;
alter table public.catalog add constraint catalog_origem_check
  check (origem in ('manual', 'substancia', 'multilojas', 'vendas'));

create or replace function public.propagate_catalog_shared_library()
returns trigger
language plpgsql
security definer
set search_path to 'public, extensions'
as $$
begin
  insert into public.catalog (store_id, nome, codigo, categoria, origem)
  select s.id, new.nome, null, new.categoria, 'multilojas'
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

drop trigger if exists trg_propagate_catalog_shared_library on public.catalog_shared_library;
create trigger trg_propagate_catalog_shared_library
after insert or update on public.catalog_shared_library
for each row execute function public.propagate_catalog_shared_library();

-- Backfill único: joga pro pool compartilhado tudo que qualquer loja já
-- ativa no grupo já tinha classificado no próprio Catálogo antes deste
-- mecanismo existir (caso da 7152, que já vinha fazendo ajustes manuais
-- antes de ter modelo_catalogo definido). Cada linha inserida aqui dispara o
-- trigger acima, então isso já propaga para as lojas irmãs na mesma
-- operação — não precisa de um passo de propagação separado.
insert into public.catalog_shared_library (modelo_catalogo, nome, nome_normalizado, categoria)
select distinct on (s.modelo_catalogo, public.normalize_text(c.nome))
  s.modelo_catalogo, c.nome, public.normalize_text(c.nome), c.categoria
from public.catalog c
join public.stores s on s.id = c.store_id
where s.modelo_catalogo is not null and s.status = 'active'
order by s.modelo_catalogo, public.normalize_text(c.nome), c.created_at
on conflict (modelo_catalogo, nome_normalizado) do nothing;
