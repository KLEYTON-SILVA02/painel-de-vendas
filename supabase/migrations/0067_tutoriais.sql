-- Função Tutoriais: ajuda contextual (balões) + central de treinamento.
--
-- Diferente de quase toda outra tabela do sistema, help_tips e tutorials
-- NÃO são escopadas por store_id: o conteúdo explica o funcionamento do
-- próprio sistema, é o mesmo para qualquer loja, e por ora só eu edito
-- (via migration) — não há tela de ADM para isso ainda, então não existe
-- política de insert/update/delete para usuários comuns. tutorial_progress
-- já é por pessoa (profile_id), pois cada usuário conclui os treinamentos
-- na própria conta, em qualquer dispositivo (ao contrário do sistema
-- antigo, que guardava isso só no aparelho).

create table public.help_tips (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  texto text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tutorials (
  id uuid primary key default gen_random_uuid(),
  grupo text not null,
  titulo text not null,
  nivel text not null check (nivel in ('iniciante', 'intermediario', 'avancado')),
  duracao_min int not null default 3,
  resumo text not null,
  descricao text not null default '',
  passos jsonb not null default '[]'::jsonb,
  perfil_alvo text not null default 'ambos' check (perfil_alvo in ('admin', 'colaborador', 'ambos')),
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tutorial_progress (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tutorial_id uuid not null references public.tutorials(id) on delete cascade,
  concluido_em timestamptz not null default now(),
  primary key (profile_id, tutorial_id)
);

alter table public.help_tips enable row level security;
alter table public.tutorials enable row level security;
alter table public.tutorial_progress enable row level security;

-- Leitura liberada a qualquer usuário autenticado (ADM ou colaborador, de
-- qualquer loja) — sem política de escrita: por ora o conteúdo só muda por
-- migration/service role.
create policy help_tips_select on public.help_tips for select
  using (auth.uid() is not null);
create policy tutorials_select on public.tutorials for select
  using (auth.uid() is not null);

-- tutorial_progress: cada perfil só enxerga/grava a própria linha, mesmo
-- padrão de individual_goals_select_self em 0001_init.sql.
create policy tutorial_progress_select_self on public.tutorial_progress for select
  using (profile_id = auth.uid());
create policy tutorial_progress_insert_self on public.tutorial_progress for insert
  with check (profile_id = auth.uid());
create policy tutorial_progress_delete_self on public.tutorial_progress for delete
  using (profile_id = auth.uid());

-- Primeiro lote de balões de ajuda (Etapa 1) — cobre as 5 telas de maior
-- impacto para quem está começando. Mais chaves entram depois, tela a tela.
insert into public.help_tips (chave, texto) values
  ('dashboard.filtro_categoria', 'Escolha uma categoria para ver só as vendas dela na tela e no ranking.'),
  ('dashboard.filtro_data', 'Clique num dia ou use "Buscar período" para escolher um intervalo de datas.'),
  ('importar.botao_importar', 'Envie a planilha de vendas do dia (.xlsx, .xls, .csv ou .ods) para atualizar o sistema.'),
  ('importar.mapeamento_colunas', 'Confira se cada coluna da sua planilha foi identificada corretamente antes de confirmar.'),
  ('ranking.filtros', 'Use ''Modo Geral'' para ver o mês inteiro, ou ''Busca período'' para escolher um intervalo específico de datas.'),
  ('configuracoes.notificacoes', 'Defina o horário e os dias em que o sistema avisa a equipe sobre as vendas do dia.'),
  ('colaboradores.importar_planilha', 'Cadastre vários colaboradores de uma vez enviando uma planilha com nome, matrícula e setor.');
