-- Ajuste pedido pelo usuário: o resumo de vendas por importação (migration
-- 0041, categorias fixas por setor) incluía CHIP para Caixa,
-- Dermoconsultora, Gerência e Farmacêutico — nenhum desses setores vende
-- esse tipo de item no dia a dia da loja, e o usuário confirmou que CHIP
-- não deve aparecer em nenhum dos resumos. Balcão já não tinha CHIP e
-- continua igual (Mercadoria Geral, Marcas Exclusivas, Dermocosméticos,
-- Genéricos, Levmel — exatamente a lista pedida).
--
-- `else` (hoje só atingido por Visitante, que não tem array fixo próprio —
-- usa categoriasVisitante por fora deste mecanismo) mantém CHIP como
-- estava: não foi pedido para mudar, e é o fallback de segurança para
-- qualquer setor não previsto.
create or replace function public.sector_base_categories(setor_param text)
returns text[]
language sql
immutable
as $$
  select case setor_param
    when 'Balcão' then array['MER', 'MP', 'DERM', 'GEN', 'LEVMEL']
    when 'Caixa' then array['MER', 'MP', 'DERM', 'LEVMEL']
    when 'Dermoconsultora' then array['MER', 'MP', 'DERM', 'LEVMEL']
    when 'Gerência' then array['MER', 'MP', 'DERM', 'GEN', 'LEVMEL']
    when 'Farmacêutico' then array['MER', 'MP', 'DERM', 'GEN', 'LEVMEL']
    else array['MER', 'MP', 'DERM', 'GEN', 'LEVMEL', 'CHIP']
  end;
$$;
