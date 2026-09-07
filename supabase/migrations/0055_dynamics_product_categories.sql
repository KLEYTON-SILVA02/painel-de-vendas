alter table public.dynamics
  add column categorias_produtos jsonb not null default '[]'::jsonb,
  add column multiplicador_ativo boolean not null default false,
  add column multiplicador_valor numeric not null default 0;

comment on column public.dynamics.categorias_produtos is 'Array de {id, nome, produtos: string[], palavra_chave: string} — separa os produtos participantes da dinâmica em categorias exibidas lado a lado; vazio = comportamento legado (usa a lista plana "produtos")';
comment on column public.dynamics.multiplicador_ativo is 'Quando true, multiplica a quantidade de itens vendidos de cada categoria por multiplicador_valor para gerar uma pontuação por categoria';
comment on column public.dynamics.multiplicador_valor is 'Valor multiplicado pela quantidade de itens vendidos de cada categoria quando multiplicador_ativo = true';
