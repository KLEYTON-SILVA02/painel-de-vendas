-- PLANO B (MONITORAMENTO DE LOJAS) — Fase 1, primeira peça: a auto-
-- identificação de "modelo de catálogo" que uma loja declara sobre si mesma
-- em Minha Loja. Decisão registrada no CLAUDE.md: casar produtos por nome
-- entre lojas só é confiável dentro de um grupo de lojas que já usa a mesma
-- convenção de nomenclatura (ex.: Extrafarma e Pague Menos, que compartilham
-- o mesmo padrão de identificação de produto). Em vez de um cadastro cross-
-- loja novo (que exigiria alguém enxergando todas as lojas de uma vez — uma
-- superfície que este projeto nunca teve), cada loja só grava uma tag na
-- própria linha, exatamente como nome_loja/numero_loja já funcionam hoje —
-- zero policy nova, a UPDATE de stores já é do próprio admin da loja
-- (stores_update_admin, ver 0001_init.sql).
--
-- A lista de valores válidos é fixa e vive no código (src/lib/business/
-- catalogModels.ts) — adicionar um novo grupo é um deploy, não uma ação de
-- admin, de propósito: mantém a constraint abaixo e o enum do frontend
-- sempre em sincronia manual, sem depender de uma tabela editável.
alter table public.stores
  add column modelo_catalogo text
  check (modelo_catalogo is null or modelo_catalogo in ('rede_extrafarma_pague_menos'));

comment on column public.stores.modelo_catalogo is
  'Chave fixa (ver src/lib/business/catalogModels.ts) do modelo de identificação de produtos desta loja. Nulo = loja independente, não participa da biblioteca de catálogo compartilhada entre lojas do Monitoramento de Lojas.';
