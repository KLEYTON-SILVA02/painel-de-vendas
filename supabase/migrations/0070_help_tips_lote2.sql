-- Balões de ajuda: segundo lote de conteúdo, pedido explicitamente pelo
-- usuário ("atualmente é disponibilizado pouquíssimo suporte de
-- informativos... para cada botão e funções do sistema"). Expande a
-- cobertura de help_tips para praticamente todas as telas do ADM desktop
-- que ainda não tinham nenhum balão — o primeiro lote (0067) cobria só
-- Início/Importar/Colaboradores/Configurações/Ranking. Os textos aqui
-- casam com os `fallback` já escritos em cada <HelpTip> no código (o
-- fallback só entra em cena se, por algum motivo, esta migration ainda não
-- tiver rodado).
insert into public.help_tips (chave, texto) values
  ('categoria.gerar_imagem', 'Monta uma imagem pronta do ranking desta categoria, para copiar ou baixar e compartilhar no WhatsApp.'),
  ('categoria.detalhamento_vendedor', 'Mostra o total de cada colaborador nesta categoria, do maior para o menor, no período selecionado.'),
  ('categoria.imprimir_extrato', 'Gera um extrato pronto para impressão com data, produto, quantidade e valor de cada venda do colaborador/comissão filtrado.'),
  ('dinamicas.nova', 'Uma campanha à parte das metas normais, com meta, período e participantes próprios — os produtos/categorias escolhidos contam só para essa dinâmica.'),
  ('biosintetica.grupos_pontos', '''Gerenciar Grupos'' vincula produtos aos grupos G1-G4; ''Gerenciar Pontos'' define a pontuação (Meta 1/2/3) de cada grupo.'),
  ('conquistas.faixas', 'Cada faixa é um valor de premiação da categoria — filtre por uma faixa para ver só quem já bateu ela no dia.'),
  ('auditoria.pendentes', 'Produtos vendidos que o sistema ainda não conseguiu classificar automaticamente — selecione um ou mais e escolha a categoria certa.'),
  ('colaboradores.criar_acesso', 'Criar acesso gera a primeira senha do colaborador; Gerar nova senha troca a senha de quem já tem login. O login em si (matrícula) não muda.'),
  ('colaboradores.foto_conquistas', 'Foto separada, usada só nos cards de premiação da Galeria de Conquistas — pode ser diferente do avatar do dia a dia.'),
  ('categorias.criar_nova', 'Só use isto para uma parceria de verdade nova, como a Biosintética — cada categoria criada aqui ganha seu próprio botão fixo no menu lateral.'),
  ('ranking.gerar_imagem_coluna', 'Escolha entre gerar a imagem só desta categoria ou de todas as colunas do ranking de uma vez.'),
  ('reclassificar.produtos', 'Selecione um ou mais produtos na lista e mude a categoria deles de uma vez — inclui as vendas já importadas desse produto.'),

  ('metas.aba_categoria', 'Meta mensal de cada categoria — a meta diária pode ser redistribuída automaticamente.'),
  ('metas.aba_individuais', 'Define uma meta própria para um colaborador específico, além da meta geral da categoria.'),
  ('metas.aba_unidade', 'Meta Mensal e Meta Diária de Levmel/Chip, em unidades (não em R$).'),
  ('metas.aba_comissoes', 'Percentual de comissão pago por categoria, usado no detalhamento e nos extratos impressos.'),

  ('produtos.aba_produtos', 'Cadastro manual de produtos por categoria (Dermo/Genérico/Marcas Exclusivas), um de cada vez.'),
  ('produtos.aba_catalogo', 'Lista de produtos exatos já reconhecidos automaticamente na importação de vendas.'),
  ('produtos.aba_classificados', 'Todo produto já visto em alguma venda, com a categoria que o sistema identificou — reclassifique aqui se algo saiu errado.'),
  ('produtos.aba_palavras', 'Palavras-chave usadas para reconhecer produtos novos automaticamente, sem precisar cadastrar um a um.'),
  ('produtos.aba_exclusivas', 'Marcas que sempre entram em Marcas Exclusivas, mesmo sem estar no catálogo ou nas palavras-chave.'),
  ('produtos.aba_substancias', 'Substâncias usadas para reconhecer produtos Genéricos automaticamente pelo nome.')
on conflict (chave) do nothing;
