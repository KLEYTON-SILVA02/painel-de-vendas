-- Hardens the 5 functions added in 0034 against search_path hijacking
-- (same class of fix as 0002_harden_helper_function_grants.sql) — pins
-- each to `public, extensions` instead of resolving unqualified calls
-- (unaccent(), normalize_text(), etc.) against whatever search_path the
-- calling session happens to have.
alter function public.normalize_text(text) set search_path = public, extensions;
alter function public.matches_special_list(text, text[]) set search_path = public, extensions;
alter function public.classify_bio(text, uuid) set search_path = public, extensions;
alter function public.archive_old_sales_for_store(uuid, date) set search_path = public, extensions;
alter function public.archive_old_sales() set search_path = public, extensions;
