-- Função Tutoriais: permite que um ADM atualize o passo a passo (campo
-- `passos`, especificamente a `imagem_url` de cada passo) via o novo botão
-- de upload de prints no próprio TutorialViewer. Até aqui `tutorials` só
-- tinha política de select — o conteúdo era cadastrado só por migration,
-- por decisão explícita ("começar simples"). `tutorials` não tem
-- `store_id` (é conteúdo global, o mesmo treinamento vale pra qualquer
-- loja), então não há como restringir esse update à própria loja do ADM;
-- liberar para qualquer is_admin() é aceito como risco razoável dado o uso
-- real do sistema até aqui (poucos ADMs, confiança mútua).
create policy tutorials_update_admin on public.tutorials for update
  using (is_admin())
  with check (is_admin());
