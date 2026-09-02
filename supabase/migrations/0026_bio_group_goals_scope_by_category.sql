-- Part A, stage 4: with the ADM now able to create real additional
-- category types (each with its own groups), the old `unique(store_id,
-- grupo)` constraint on bio_group_goals would let two different categories'
-- same-named group (e.g. both calling their first group "grupo_1") collide
-- and silently overwrite each other's goals/weights. Rescopes the unique
-- key — and the upsert target that relies on it — to
-- (store_id, category_type_id, grupo).
alter table public.bio_group_goals drop constraint bio_group_goals_store_id_grupo_key;
alter table public.bio_group_goals add constraint bio_group_goals_store_category_grupo_key unique (store_id, category_type_id, grupo);
