-- Covers any query that still orders sales by (data_iso, id) — e.g. a
-- direct report or a future screen — with a single index walk instead of
-- an in-memory sort. The main `useSales()`/`useCurrentMonthSales()` fetch
-- path (src/lib/queries.ts) no longer needs this specifically (it now
-- paginates via keyset on the primary key `id` instead of ordering by
-- date), but this index is effectively free on an 11MB table and keeps
-- every other data_iso-ordered query fast as the table grows.
create index sales_store_data_id_idx on public.sales (store_id, data_iso desc, id asc);
