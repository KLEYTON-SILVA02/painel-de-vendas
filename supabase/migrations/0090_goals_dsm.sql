-- Widen goals.categoria to also accept 'DSM', mirroring 0009's widening for
-- LEVMEL/CHIP — DSM's Meta Mensal/Diária (Metas > Sub-categorias) reuses the
-- exact same goals table/mutation, scored in unidades (conversões) exactly
-- like the two existing unit-based categories, via metrica = 'unidade'
-- (already an allowed value, no change needed there).
alter table public.goals
  drop constraint goals_categoria_check,
  add constraint goals_categoria_check
    check (categoria in ('DERM', 'GEN', 'MP', 'MER', 'LEVMEL', 'CHIP', 'DSM'));
