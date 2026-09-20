-- "Biblioteca compartilhada" de classificação por modelo_catalogo — mecanismo
-- diferente de catalog_correction_log/apply_catalog_correction (migration
-- 0078), que é o caminho de volta do Monitoramento de Lojas e continua
-- inerte enquanto esse projeto não existir (ver CLAUDE.md, tentativa de
-- criação bloqueada pelo limite do plano Free). Este aqui não depende do
-- Monitoramento: é 100% dentro deste projeto, sempre iniciado pela própria
-- loja, nos dois sentidos —
--   escrita: quando uma loja com modelo_catalogo classifica um produto
--   (useReclassifyProdutos), ela também contribui essa classificação aqui;
--   leitura: quando outra loja do mesmo grupo encontra um produto não
--   classificado, ela pode consultar aqui e ver uma sugestão — nunca
--   aplicada sozinha, sempre como sugestão para o ADM confirmar.
-- Nenhuma loja nunca escreve nem lê a linha de outro grupo — nunca há um
-- caminho de uma loja escrever direto nos dados de outra loja específica,
-- só neste "pool" neutro compartilhado dentro do próprio grupo.
create table public.catalog_shared_library (
  id uuid primary key default gen_random_uuid(),
  modelo_catalogo text not null,
  nome text not null,
  nome_normalizado text not null,
  categoria text not null check (categoria in ('DERM', 'GEN', 'MP', 'MER')),
  contribuicoes integer not null default 1,
  atualizado_em timestamptz not null default now(),
  unique (modelo_catalogo, nome_normalizado)
);
create index catalog_shared_library_modelo_idx on public.catalog_shared_library(modelo_catalogo);

alter table public.catalog_shared_library enable row level security;

-- Só enxerga linhas do próprio grupo — uma loja sem modelo_catalogo (a
-- maioria, hoje) não vê nem contribui nada aqui, fica tão isolada quanto
-- sempre foi.
create policy catalog_shared_library_select on public.catalog_shared_library for select
  using (
    modelo_catalogo is not null
    and modelo_catalogo = (select s.modelo_catalogo from public.stores s where s.id = public.current_store_id())
  );

create policy catalog_shared_library_insert_admin on public.catalog_shared_library for insert
  with check (
    public.is_admin()
    and modelo_catalogo is not null
    and modelo_catalogo = (select s.modelo_catalogo from public.stores s where s.id = public.current_store_id())
  );

create policy catalog_shared_library_update_admin on public.catalog_shared_library for update
  using (
    public.is_admin()
    and modelo_catalogo = (select s.modelo_catalogo from public.stores s where s.id = public.current_store_id())
  )
  with check (
    public.is_admin()
    and modelo_catalogo is not null
    and modelo_catalogo = (select s.modelo_catalogo from public.stores s where s.id = public.current_store_id())
  );
