-- The legacy system's ranking model toggle has exactly two values:
-- 'escadinha' (staggered podium capsules) and 'lista' (flat list). The
-- original check constraint guessed a nonexistent 'capsula' value.
alter table public.store_settings drop constraint store_settings_modelo_ranking_check;
alter table public.store_settings add constraint store_settings_modelo_ranking_check
  check (modelo_ranking in ('escadinha', 'lista'));
