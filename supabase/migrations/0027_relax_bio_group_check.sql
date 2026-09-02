-- Part A, stage 4: the generic Grupos UI lets the ADM name a group anything
-- ("Ouro", "Prata", a free-form label) — `grupo` itself IS the display
-- label now, no separate name column needed. Drops the CHECK constraints
-- that fixed it to exactly 'G1'..'G4' (still BIOSINTÉTICA's own values,
-- just no longer enforced at the DB level) and replaces them with a
-- simple non-empty check.
alter table public.bio_groups drop constraint bio_groups_grupo_check;
alter table public.bio_groups add constraint bio_groups_grupo_check check (grupo <> '');

alter table public.bio_group_goals drop constraint bio_group_goals_grupo_check;
alter table public.bio_group_goals add constraint bio_group_goals_grupo_check check (grupo <> '');
