-- Multiple commission rates per category. Marcas Exclusivas (MP) needs up
-- to 3 independent commission percentages (each with its own on/off toggle
-- in the category breakdown screens); Dermo/Genéricos keep a single slot
-- (slot 1) as before. `slot` replaces `categoria` alone as the per-row
-- discriminator.
alter table public.commission_rates add column slot smallint not null default 1 check (slot between 1 and 3);

alter table public.commission_rates drop constraint commission_rates_store_id_categoria_key;
alter table public.commission_rates add constraint commission_rates_store_id_categoria_slot_key unique (store_id, categoria, slot);
