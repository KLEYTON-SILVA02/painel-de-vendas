-- Dinâmicas > "Setor participante" now lists every registered setor (not
-- just Balcão/Caixa), so setor_alvo stops being restricted to that closed
-- 3-value picklist and becomes free text — same shape as collaborators.setor
-- itself, which this column is matched against. 'ambos' keeps meaning "no
-- restriction"; 'balcao'/'caixa' remain valid as legacy values already
-- stored on existing rows (dynamicAllowsCollaborator in dynamics.ts still
-- maps them to 'Balcão'/'Caixa').
alter table public.dynamics drop constraint dynamics_setor_alvo_check;
