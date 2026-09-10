-- "Substâncias" (Genéricos): uma lista, em coluna única, de nomes de
-- substâncias (ex.: "Dipirona", "Paracetamol", "Losartana") mantida pelo ADM
-- especificamente para a categoria Genéricos. Diferente das palavras-chave
-- de marca (Tier 3, brand_keywords — que para GEN exige um "marcador de
-- genérico" no nome, ver GENERIC_MARKERS em classification.ts) e das
-- palavras-chave por produto (Tier 2, products), essa lista não entra
-- direto no motor de classificação: ela alimenta a varredura manual da aba
-- "Substâncias" (ProdutosPage) — que escaneia os produtos já vendidos,
-- identifica quais contêm alguma dessas substâncias no nome e reclassifica
-- cada produto batido (mesmo mecanismo de useReclassifyProdutos que
-- ReclassifyBar já usa: upsert no Catálogo + atualização retroativa de
-- sales.grupo), com o Catálogo marcado por `origem` para a UI poder separar
-- "cadastrados manualmente" de "identificados via substância" numa aba
-- isolada — sem que isso mude como as duas origens contam para a
-- classificação (Tier 1 trata as duas igualmente).
create table public.generic_substances (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now()
);
create index generic_substances_store_idx on public.generic_substances(store_id);

alter table public.catalog add column origem text not null default 'manual' check (origem in ('manual', 'substancia'));

alter table public.generic_substances enable row level security;
do $$
begin
  execute format('create policy %I_select on public.%I for select using (store_id = public.current_store_id())', 'generic_substances', 'generic_substances');
  execute format('create policy %I_insert_admin on public.%I for insert with check (public.is_admin() and store_id = public.current_store_id())', 'generic_substances', 'generic_substances');
  execute format('create policy %I_update_admin on public.%I for update using (public.is_admin() and store_id = public.current_store_id())', 'generic_substances', 'generic_substances');
  execute format('create policy %I_delete_admin on public.%I for delete using (public.is_admin() and store_id = public.current_store_id())', 'generic_substances', 'generic_substances');
end $$;
