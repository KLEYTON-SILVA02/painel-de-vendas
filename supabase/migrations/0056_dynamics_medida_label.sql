alter table public.dynamics
  add column medida_label text not null default '';

comment on column public.dynamics.medida_label is 'Rótulo customizado da unidade quando metrica = ''unidade'' (ex: "caixas", "pares"); vazio = exibir "un." genérico';
