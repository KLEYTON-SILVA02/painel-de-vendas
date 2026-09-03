-- ADM-configurable ranking podium layout ("varinha mágica" calibration
-- tool in Configurações → Aparência do Ranking): each store can upload its
-- own top-3 podium background and click/drag to mark exactly where the
-- photo circles and the value/name text should land on it, instead of
-- relying on the coordinates hardcoded in PodiumSplit.tsx for the
-- ADM-supplied stock artwork. Both columns are nullable — null means "use
-- the built-in default artwork/positions", so existing stores are
-- unaffected until an ADM opens the new tool and saves a calibration.
-- ranking_podium_spots shape (per rank 0/1/2): { left, top, diameter,
-- valueLeft, valueTop, valueSize, valueMaxWidth, nomeLeft, nomeTop,
-- nomeSize, nomeMaxWidth } — same fields PodiumSplit.tsx already computes
-- for the stock artwork, just store-editable now.
alter table public.store_settings
  add column ranking_podium_bg_url text,
  add column ranking_podium_spots jsonb;
