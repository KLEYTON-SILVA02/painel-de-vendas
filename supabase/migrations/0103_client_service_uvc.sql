-- UVC (Unidades Vendidas por Cliente): itens vendidos ÷ clientes atendidos,
-- por colaborador/dia. O numerador (itens vendidos) já existe em `sales`;
-- o denominador (atendimentos) não existia em lugar nenhum do sistema —
-- nasce aqui, importado de uma planilha separada ("Vendas por Clientes",
-- colunas Data/Matrícula/Nome/Quantidade Vendida), nunca derivado de
-- `sales` (a planilha de vendas comum não tem como dizer quantos clientes
-- um vendedor atendeu, só quantos itens vendeu).
--
-- Uma linha por colaborador/dia (já agregada — soma da "Quantidade
-- Vendida" de todas as linhas daquele vendedor naquele dia na planilha
-- original; o detalhe de produto/código/valor dessa planilha não é
-- guardado, não serve pra nada no cálculo). Reimportar o mesmo dia
-- SUBSTITUI o valor salvo, nunca soma (decisão explícita do usuário, pra
-- não arriscar duplicar e inflar a métrica) — garantido na própria tabela
-- por um unique constraint (store_id, collaborator_id, data), que o
-- import usa com `upsert`/`on conflict do update` em vez de delete+insert.
create table public.client_service_imports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  file_name text,
  row_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index client_service_imports_store_idx on public.client_service_imports(store_id);

alter table public.client_service_imports enable row level security;
create policy client_service_imports_select_admin on public.client_service_imports for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy client_service_imports_insert_admin on public.client_service_imports for insert
  with check (public.is_admin() and store_id = public.current_store_id());

create table public.client_service_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  data date not null,
  atendimentos integer not null check (atendimentos >= 0),
  import_id uuid references public.client_service_imports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, collaborator_id, data)
);
create index client_service_records_store_idx on public.client_service_records(store_id);
create index client_service_records_collaborator_idx on public.client_service_records(collaborator_id);
create index client_service_records_store_data_idx on public.client_service_records(store_id, data);

alter table public.client_service_records enable row level security;
create policy client_service_records_select_admin on public.client_service_records for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy client_service_records_insert_admin on public.client_service_records for insert
  with check (public.is_admin() and store_id = public.current_store_id());
-- Necessária para o `upsert` (insert ... on conflict do update) que o
-- import usa para substituir, nunca somar, um dia já importado.
create policy client_service_records_update_admin on public.client_service_records for update
  using (public.is_admin() and store_id = public.current_store_id())
  with check (public.is_admin() and store_id = public.current_store_id());
create policy client_service_records_delete_admin on public.client_service_records for delete
  using (public.is_admin() and store_id = public.current_store_id());

-- daily_items_sold_by_collaborator(): numerador do UVC — soma de
-- sales.qtd por matrícula/dia, agregada no banco em vez de baixar o
-- histórico de vendas inteiro no navegador. Mesmo padrão e mesmo motivo de
-- distinct_products_in_sales()/last_sale_date_by_collaborator() (migration
-- 0102, resposta à cota de banda do Supabase estourada).
create or replace function public.daily_items_sold_by_collaborator(desde date, ate date)
returns table(matricula text, data_iso date, total_qtd numeric)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.matricula, s.data_iso, sum(s.qtd) as total_qtd
  from public.sales s
  where s.store_id = public.current_store_id()
    and public.is_admin()
    and s.data_iso between desde and ate
  group by s.matricula, s.data_iso
$$;

revoke execute on function public.daily_items_sold_by_collaborator(date, date) from public, anon;
grant execute on function public.daily_items_sold_by_collaborator(date, date) to authenticated;
