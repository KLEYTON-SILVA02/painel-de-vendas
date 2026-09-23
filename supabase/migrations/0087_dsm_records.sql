-- DSM ("Desconto Só Meu"): dinâmica de farmácia onde o colaborador oferece
-- cupons de desconto em produtos sugeridos, e cada cliente que usa o cupom
-- (compra um dos produtos sugeridos) conta como uma conversão. Este
-- contador é importado de fora (planilha do relatório de vendas por
-- desconto, ou foto desse relatório lida por OCR — telas dessas duas
-- importações ainda por vir em fases seguintes) — não é calculado a partir
-- de `sales` e não tem nenhuma relação com o motor de classificação de
-- produto (category_types/bio_groups): é uma contagem direta de conversões
-- por colaborador e por dia.
--
-- Cada importação grava linhas novas — nunca substitui uma importação
-- anterior (decisão do usuário: o total exibido é sempre a SOMA de todas as
-- importações, diferente do padrão "substituir por dia" usado em
-- sales/Super Troco). A proteção contra reimportar o mesmo arquivo duas
-- vezes por engano fica por conta da aplicação (mesmo padrão de
-- saleImportKey em salesImport.ts), não de uma constraint aqui.
create table public.dsm_imports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  origem text not null check (origem in ('planilha', 'imagem')),
  file_name text,
  row_count integer not null default 0,
  duplicate_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index dsm_imports_store_idx on public.dsm_imports(store_id);

alter table public.dsm_imports enable row level security;
create policy dsm_imports_select_admin on public.dsm_imports for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy dsm_imports_insert_admin on public.dsm_imports for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy dsm_imports_delete_admin on public.dsm_imports for delete
  using (public.is_admin() and store_id = public.current_store_id());

create table public.dsm_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  data date not null,
  quantidade integer not null check (quantidade >= 0),
  import_id uuid references public.dsm_imports(id) on delete set null,
  created_at timestamptz not null default now()
);
create index dsm_records_store_idx on public.dsm_records(store_id);
create index dsm_records_collaborator_idx on public.dsm_records(collaborator_id);
create index dsm_records_store_data_idx on public.dsm_records(store_id, data);

alter table public.dsm_records enable row level security;

-- Mesmo padrão de `sales`: admin enxerga tudo da loja; colaborador só
-- enxerga os próprios registros. A tela de Ranking (que precisa mostrar
-- todo mundo pra qualquer um) vai usar, numa fase seguinte, uma function
-- security definer própria — mesmo mecanismo já usado no app mobile pro
-- ranking geral de vendas.
create policy dsm_records_select_admin on public.dsm_records for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy dsm_records_select_self on public.dsm_records for select
  using (store_id = public.current_store_id() and collaborator_id = public.current_collaborator_id());
create policy dsm_records_insert_admin on public.dsm_records for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy dsm_records_delete_admin on public.dsm_records for delete
  using (public.is_admin() and store_id = public.current_store_id());
