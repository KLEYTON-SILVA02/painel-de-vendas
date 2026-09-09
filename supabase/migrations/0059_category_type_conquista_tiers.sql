-- Opt-in flat R$ tier ladder for ADM-created generic categories (Gerenciar
-- Categorias) to participate in Conquistas / Card do Campeão estrelinhas —
-- a completely separate mechanism from bio_group_goals' per-group weighted
-- meta1/2/3 (see 0011_bio_group_goals.sql), which stays untouched and keeps
-- powering "Gerenciar Pontos" exactly as before. NULL (the default) means
-- the category doesn't participate, same as today for every existing row —
-- Biosintética (sistema = true) is never expected to have this set: it's
-- an isolated category with its own achievement system, not part of
-- Conquistas/Champion stars.
alter table public.category_types
  add column conquista_tiers numeric[];
