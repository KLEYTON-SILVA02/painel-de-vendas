-- Função Tutoriais: segundo lote de conteúdo, pedido explicitamente pelo
-- usuário — cadastro/foto/acesso de colaboradores, metas, Minha Loja
-- (número/WhatsApp), Galeria de Conquistas, imagens de ranking, as duas
-- impressões (extrato do mês e extrato por colaborador/comissão), nova
-- dinâmica, notificações, detalhamento por vendedor, Galeria de Figurinhas
-- e Lista de Vendas detalhada. "Menu lateral" já tinha um tutorial próprio
-- desde o primeiro lote (0067), por isso não se repete aqui.
insert into public.tutorials (grupo, titulo, nivel, duracao_min, resumo, descricao, passos, perfil_alvo, ordem) values
  ('administracao', 'Cadastrar colaboradores, trocar foto e liberar acesso', 'iniciante', 5,
   'Cadastre um colaborador novo, troque a foto dele e libere o login.',
   'O cadastro, a foto e o acesso de login são feitos na mesma tela, um após o outro.',
   '[{"texto":"Em ADM > Colaboradores, preencha o formulário \"Novo colaborador\" (matrícula, nome, apelido, setor) e confirme."},{"texto":"Abra o card do colaborador para trocar a foto — clique no campo de foto e recorte a imagem enviada."},{"texto":"Em \"Foto p/ Conquistas\" você pode cadastrar uma segunda foto, usada só nos cards de premiação."},{"texto":"Clique em \"🔑 Criar acesso\" para gerar a primeira senha do colaborador (ou \"🔑 Gerar nova senha\" se ele já tiver acesso)."}]'::jsonb,
   'admin', 1),

  ('categorias_e_metas', 'Cadastrar metas de vendas', 'iniciante', 4,
   'Defina a meta mensal, diária e super meta de cada categoria, ou metas individuais por colaborador.',
   'As metas ficam organizadas em abas: por categoria, individuais, Levmel/Chip e comissões.',
   '[{"texto":"Acesse \"Metas\" no menu lateral."},{"texto":"Na aba \"Por Categoria\", informe a meta mensal de cada categoria — a meta diária pode ser redistribuída automaticamente."},{"texto":"Na aba \"Metas Individuais\", defina uma meta própria para um colaborador específico."},{"texto":"\"Levmel / Chip\" e \"Comissões\" ficam em abas separadas, com sua própria configuração."}]'::jsonb,
   'admin', 1),

  ('categorias_e_metas', 'Criar uma nova Dinâmica Comercial', 'intermediario', 5,
   'Configure uma campanha com meta, período e participantes.',
   'Uma dinâmica é uma campanha à parte das metas normais, com seu próprio período e regras.',
   '[{"texto":"Acesse \"Dinâmicas\" no menu lateral e clique em \"+ Nova dinâmica\"."},{"texto":"Defina título, período (início e fim), meta e a métrica (valor ou unidades)."},{"texto":"Escolha os produtos/categorias que contam para a meta, e os participantes (todos ou uma lista específica)."},{"texto":"Salve — a dinâmica aparece para os participantes assim que o período começar."}]'::jsonb,
   'admin', 2),

  ('configuracoes_e_seguranca', 'Configurar número da loja e link do WhatsApp', 'iniciante', 2,
   'Cadastre os dados da loja usados no botão "Enviar por WhatsApp".',
   'Esses dados alimentam o compartilhamento direto de imagens de ranking, conquistas e card de campeão.',
   '[{"texto":"Acesse ADM > Minha Loja."},{"texto":"Preencha \"WhatsApp da loja (com DDI e DDD)\"."},{"texto":"Se a equipe tiver um grupo, cole o link em \"Link do grupo do WhatsApp (opcional)\" — ele é usado pelo botão \"Enviar por WhatsApp\" nas imagens de ranking, conquistas e card de campeão."},{"texto":"Salve as alterações."}]'::jsonb,
   'admin', 1),

  ('configuracoes_e_seguranca', 'Configurar notificações automáticas', 'iniciante', 3,
   'Avise a equipe automaticamente sobre as vendas do dia.',
   'O disparo é automático, nos horários e dias que você configurar.',
   '[{"texto":"Acesse ADM > Configurações e encontre \"🔔 Notificações automáticas de vendas\"."},{"texto":"Escolha o horário e os dias da semana em que o aviso deve ser enviado."},{"texto":"Cada colaborador recebe uma notificação no app com o total de vendas do dia em cada categoria."},{"texto":"O sino no topo da tela mostra o histórico de notificações, com abas \"Hoje\" e \"Antigas\"."}]'::jsonb,
   'admin', 2),

  ('relatorios_e_imagens', 'Usar a Galeria de Conquistas', 'iniciante', 3,
   'Veja quem bateu as metas de premiação de cada categoria.',
   'A galeria mostra automaticamente quem atingiu cada faixa de premiação no período.',
   '[{"texto":"Clique em \"🏆 Galeria de Conquistas\" no topo da tela (ou no menu lateral)."},{"texto":"Escolha a categoria para ver os colaboradores que já bateram cada faixa de premiação no período."},{"texto":"Use \"Galeria de Figurinhas\" para ver o histórico de conquistas já registradas."}]'::jsonb,
   'admin', 1),

  ('relatorios_e_imagens', 'Gerar e copiar imagens do ranking', 'iniciante', 3,
   'Gere uma imagem do ranking pronta para compartilhar, ou copie o texto direto.',
   'Existem dois caminhos: gerar uma imagem completa, ou copiar só o texto do ranking.',
   '[{"texto":"Na tela Início ou Ranking, clique em \"🖼️ Gerar imagem\" para montar a imagem do ranking da categoria selecionada."},{"texto":"Na janela que abrir, use \"📋 Copiar imagem\" para colar direto no WhatsApp, ou \"⬇ Baixar PNG\" para salvar o arquivo."},{"texto":"\"📋 Copiar ranking\" copia só o texto (posições e valores), sem gerar imagem."}]'::jsonb,
   'admin', 2),

  ('relatorios_e_imagens', 'Imprimir o extrato de vendas do mês', 'iniciante', 2,
   'Imprima o resumo de vendas do mês, por categoria e dia a dia.',
   'O extrato sai centralizado e com margem reduzida, pronto para impressora térmica ou A4.',
   '[{"texto":"Na tela Início, no card de calendário, clique em \"🖨️ Imprimir extrato do mês\"."},{"texto":"Uma aba nova abre com o extrato pronto — confira o aviso sobre margem/escala do navegador antes de imprimir."},{"texto":"Clique em \"🖨️ Imprimir\" nessa aba (ou Ctrl+P)."}]'::jsonb,
   'admin', 3),

  ('relatorios_e_imagens', 'Imprimir a lista de vendas de um colaborador (com comissão)', 'intermediario', 3,
   'Gere um extrato individual, já com o valor de comissão calculado.',
   'O extrato impresso mostra data, produto, quantidade, valor e comissão de cada venda.',
   '[{"texto":"Em qualquer categoria, use os filtros para escolher o colaborador e a comissão desejada."},{"texto":"Clique em \"🖨️ Imprimir extrato\" — o extrato sai com Data, Produto, Qtd, Valor e Comissão de cada venda."},{"texto":"Revise as opções de impressão do navegador (margem padrão, escala 100%) antes de confirmar."}]'::jsonb,
   'admin', 4),

  ('relatorios_e_imagens', 'Conhecer a Galeria de Figurinhas', 'iniciante', 2,
   'Veja o histórico de conquistas já batidas, em formato de figurinha.',
   'Um jeito rápido de ver o histórico completo sem refazer o filtro categoria por categoria.',
   '[{"texto":"Dentro da Galeria de Conquistas, clique em \"Galeria de Figurinhas\"."},{"texto":"Cada figurinha representa uma conquista já batida por um colaborador, numa categoria e período."},{"texto":"É um jeito rápido de ver o histórico completo sem precisar refazer o filtro categoria por categoria."}]'::jsonb,
   'admin', 5),

  ('gestao_de_vendas', 'Ver o detalhamento por vendedor', 'iniciante', 2,
   'Veja o total de cada colaborador dentro de uma categoria.',
   'Mostra o ranking interno de uma categoria, do maior para o menor.',
   '[{"texto":"Em qualquer categoria, clique em \"👥 Detalhamento por vendedor\"."},{"texto":"A lista mostra o total de cada colaborador no período selecionado, do maior para o menor."},{"texto":"Use os mesmos filtros de data da tela para mudar o período do detalhamento."}]'::jsonb,
   'admin', 2),

  ('gestao_de_vendas', 'Usar a Lista de Vendas detalhada', 'iniciante', 3,
   'Veja e filtre cada venda individualmente, dia a dia.',
   'É a mesma fonte de dados usada pelos gráficos e pelo ranking — útil para conferir um número específico.',
   '[{"texto":"Acesse ADM > Lista de Vendas para ver todas as vendas já importadas, com filtro por data e colaborador."},{"texto":"Em telas como Dinâmicas e Categoria, ative o toggle \"Lista de vendas detalhada\" para ver as vendas de um período direto ali, sem trocar de tela."},{"texto":"Essa lista é sempre a mesma fonte de dados usada pelos gráficos e pelo ranking — útil para conferir um número específico."}]'::jsonb,
   'admin', 3);
