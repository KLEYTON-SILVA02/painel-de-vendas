-- Permite ao ADM ocultar qualquer uma das 6 categorias fixas (Dermo/Gen-Sim/
-- Marcas Exclusivas/Mercadoria Geral/Levmel/Chip) do menu lateral e da barra
-- de filtro de categoria da tela Início — pedido explícito do usuário,
-- separado do "ocultar categoria" já existente para categorias ADM-criadas
-- (category_types.ativo, usado por Biosintética/DSM). As 6 fixas nunca
-- tiveram uma linha em category_types (são hardcoded em CAT_NAV/RANK_FILTERS),
-- então precisam do próprio mecanismo.
--
-- Ocultar nunca apaga nem bloqueia dado nenhum: classificação de vendas,
-- metas, comissões e a própria tela /categoria/:chave continuam
-- funcionando normalmente — só o atalho no menu e o botão de filtro somem,
-- mesmo "ocultar sem apagar" já usado pelo DSM (category_types.ativo).
alter table public.store_settings
  add column hidden_categories text[] not null default '{}'
  check (hidden_categories <@ array['DERM','GEN','MP','MER','LEVMEL','CHIP']::text[]);
