-- Fix: run_catalog_group_scan() (migration 0081) and apply_catalog_correction()
-- (migration 0078) were created with `set search_path to 'public, extensions'`
-- (one quoted string) instead of `set search_path to public, extensions`
-- (two schema identifiers). Postgres treats the quoted form as a single
-- schema literally named "public, extensions", which doesn't exist — so
-- neither `public` nor `extensions` actually end up on the search path.
-- run_catalog_group_scan is the one that's actively broken: every run (every
-- 15 min via pg_cron) has been failing with "function normalize_text(text)
-- does not exist" since 0081 shipped, because that one call to
-- normalize_text() is unqualified (everything else in the function is
-- schema-qualified, e.g. public.sales, so only this call was affected).
-- apply_catalog_correction has the same malformed search_path but hasn't
-- been exercised yet (no-ops until MONITORAMENTO_BASE_URL/SYNC_SECRET are
-- configured) — fixed here too so it doesn't fail the same way once it is.
alter function public.run_catalog_group_scan() set search_path to public, extensions;
alter function public.apply_catalog_correction(text, text, text) set search_path to public, extensions;
