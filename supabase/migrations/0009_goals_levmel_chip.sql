-- Widen goals.categoria to also accept LEVMEL/CHIP, so the existing goals
-- table/RLS/mutation infrastructure can be reused for their Meta Mensal /
-- Meta Diária instead of a new table. individual_goals is left untouched —
-- Levmel/Chip stars (see champion.ts) compare against the store-level goal
-- only, not an individual one.
alter table public.goals
  drop constraint goals_categoria_check,
  add constraint goals_categoria_check
    check (categoria in ('DERM', 'GEN', 'MP', 'MER', 'LEVMEL', 'CHIP'));
