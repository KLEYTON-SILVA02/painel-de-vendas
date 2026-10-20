-- Resposta à cota de banda do Supabase estourada: duas telas de alto
-- tráfego (o menu principal do ADM e a lista de Colaboradores) baixavam o
-- histórico de vendas INTEIRO (toda linha, todo produto, toda vez que a
-- tela abria) só pra calcular um número pequeno — mesmo padrão já usado em
-- mobile_category_totals() (migration 0060), agregando no banco em vez de
-- no navegador.
--
-- distinct_products_in_sales(): AdminLandingPage só precisa saber QUANTOS
-- produtos distintos vendidos ainda não têm uma classificação específica —
-- classifyProductTier() é uma função pura de (produto, codigo), então
-- rodá-la uma vez por par distinto dá o resultado idêntico a rodar pra
-- cada venda e descartar duplicatas depois (o que o código já fazia via
-- Set), só que sem baixar as dezenas de milhares de linhas de venda.
create or replace function public.distinct_products_in_sales()
returns table(produto text, codigo text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select distinct s.produto, s.codigo
  from public.sales s
  where s.store_id = public.current_store_id()
    and public.is_admin()
$$;

-- last_sale_date_by_collaborator(): ColaboradoresPage só precisa da última
-- data de venda por matrícula, pra mostrar "última venda em X" — mesma
-- conta (max(data_iso) agrupado por matrícula), feita no banco em vez de
-- escanear toda venda no navegador.
create or replace function public.last_sale_date_by_collaborator()
returns table(matricula text, last_sale_date date)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.matricula, max(s.data_iso) as last_sale_date
  from public.sales s
  where s.store_id = public.current_store_id()
    and public.is_admin()
  group by s.matricula
$$;

revoke execute on function public.distinct_products_in_sales() from public, anon;
grant execute on function public.distinct_products_in_sales() to authenticated;
revoke execute on function public.last_sale_date_by_collaborator() from public, anon;
grant execute on function public.last_sale_date_by_collaborator() to authenticated;
