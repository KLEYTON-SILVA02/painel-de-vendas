-- Complements sales_imports (0018) with fields the import screen couldn't
-- persist before: live progress (survives a tab switch/reload instead of
-- only living in React state) and the per-batch diagnostic counts already
-- shown on screen once but never saved for later reference.
alter table public.sales_imports
  add column inserted_rows integer not null default 0,
  add column invalid_date_count integer not null default 0,
  add column unmatched_seller_count integer not null default 0,
  add column unclassified_count integer not null default 0,
  add column processing_ms integer;

-- Progress/diagnostics are written incrementally while the import runs
-- (batch by batch), which the original migration's insert/select/delete
-- policy set didn't need — only an update policy was missing.
create policy sales_imports_update_admin on public.sales_imports for update
  using (public.is_admin() and store_id = public.current_store_id())
  with check (public.is_admin() and store_id = public.current_store_id());
