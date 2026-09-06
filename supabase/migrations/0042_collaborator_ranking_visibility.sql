-- O Ranking mobile do colaborador aparecia "isolado" (só o próprio
-- colaborador, ninguém mais nas outras colocações) não por um bug de tela
-- — a lógica que monta a lista já busca todo mundo da loja — mas porque a
-- RLS de leitura em `collaborators` e `sales` restringia um colaborador
-- logado a enxergar só a própria linha/vendas. Um ranking é inerentemente
-- uma visão comparativa entre colegas da mesma loja: relaxa a leitura para
-- qualquer usuário autenticado (admin ou colaborador) ver todo mundo
-- dentro do PRÓPRIO store_id — nunca entre lojas diferentes. Nenhuma
-- policy de escrita (INSERT/UPDATE/DELETE) muda; essas continuam
-- exclusivas de admin.
drop policy if exists collaborators_select on public.collaborators;
create policy collaborators_select on public.collaborators
  for select
  using (store_id = current_store_id());

drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales
  for select
  using (store_id = current_store_id());
