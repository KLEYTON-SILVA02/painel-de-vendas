-- Correção única (dado, não esquema) pedida explicitamente pelo usuário,
-- 2026-11-01, depois de uma auditoria da leitura de planilhas de vendas
-- (diagnóstico cruzado com 4 IAs externas): o motor de classificação
-- (classifyProductTier) já prioriza código do produto antes de qualquer
-- busca por texto, mas `catalog.codigo` sempre foi gravado como null —
-- useReclassifyProdutos (mutations.ts) descartava o código que a própria
-- planilha de vendas já trazia. Corrigido no código desta mesma sessão
-- (useReclassifyProdutos agora grava o código dali pra frente); esta
-- migration só recupera o que já existia: cada venda já importada tem
-- produto + código lado a lado, então o nome de catálogo já classificado
-- pode ser casado contra o código mais frequente que aquele mesmo nome
-- teve no histórico de vendas da própria loja — sem precisar de nenhuma
-- planilha nova nem ação do usuário.
--
-- `distinct on (store_id, nome_norm) ... order by n desc` escolhe o código
-- mais frequente quando o mesmo nome (normalizado) aparece com mais de um
-- código no histórico — caso raro (3 ocorrências em ~9.460 nomes testados
-- numa única loja) — e nunca é um impeditivo: só não enche aquele produto
-- específico, sem travar os demais. Só preenche `codigo` onde já está
-- vazio — nunca sobrescreve um código que já tenha sido gravado por
-- qualquer motivo (manual ou por uma correção anterior).
with vendas_por_nome as (
  select store_id, normalize_text(produto) as nome_norm, codigo, count(*) as n
  from sales
  where codigo is not null and codigo <> ''
  group by store_id, normalize_text(produto), codigo
),
melhor_codigo as (
  select distinct on (store_id, nome_norm) store_id, nome_norm, codigo
  from vendas_por_nome
  order by store_id, nome_norm, n desc
)
update catalog c
set codigo = m.codigo
from melhor_codigo m
where m.store_id = c.store_id
  and m.nome_norm = normalize_text(c.nome)
  and (c.codigo is null or c.codigo = '');
