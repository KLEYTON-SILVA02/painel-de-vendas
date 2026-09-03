-- New "Ranking Geral" podium visual (top-3 domed towers + a 4-15 pill grid,
-- replacing the single-row staggered capsules) is opt-out per store via an
-- inline toggle switch on the ranking screens themselves — independent of
-- the existing modelo_ranking ('escadinha'/'lista') full-ranking-list
-- choice, which keeps governing screens the new design doesn't cover
-- (BIOSINTÉTICA, Dinâmicas, mobile). Defaults to true: new stores, and every
-- existing store, see the new design first per the ADM's request.
alter table public.store_settings add column ranking_moderno boolean not null default true;
