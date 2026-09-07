alter table public.dynamics
  add column meta_modo text not null default 'geral' check (meta_modo in ('geral', 'individual')),
  add column metas_individuais jsonb not null default '{}'::jsonb;

comment on column public.dynamics.meta_modo is 'geral = uma meta única para toda a dinâmica (meta_valor); individual = cada participante tem sua própria meta (metas_individuais)';
comment on column public.dynamics.metas_individuais is 'Mapa matricula -> meta individual (número), usado apenas quando meta_modo = ''individual''';
