-- Tracks each spreadsheet upload as its own record ("identificação da
-- planilha") — lets the import screen detect that a file was already
-- imported before (by content hash) and warn the admin, and lets every
-- imported sale be traced back to the upload that created it.
create table public.sales_imports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  file_name text not null,
  file_hash text not null,
  row_count integer not null default 0,
  duplicate_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index sales_imports_store_hash_idx on public.sales_imports(store_id, file_hash);

alter table public.sales_imports enable row level security;

create policy sales_imports_select on public.sales_imports for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy sales_imports_insert_admin on public.sales_imports for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy sales_imports_delete_admin on public.sales_imports for delete
  using (public.is_admin() and store_id = public.current_store_id());

alter table public.sales add column import_id uuid references public.sales_imports(id) on delete set null;
create index sales_import_id_idx on public.sales(import_id);
