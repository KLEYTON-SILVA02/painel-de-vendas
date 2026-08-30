-- Which sector(s) a dynamic applies to. Default 'ambos' preserves current
-- behavior for every dynamic already registered (no sector restriction).
alter table public.dynamics
  add column setor_alvo text not null default 'ambos'
    check (setor_alvo in ('balcao', 'caixa', 'ambos'));
