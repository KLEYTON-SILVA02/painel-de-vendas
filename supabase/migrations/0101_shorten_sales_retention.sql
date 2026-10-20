-- Pedido do usuário (resposta à cota de banda do Supabase estourada):
-- "lista geral de vendas" só mantém detalhe produto a produto do mês
-- vigente — meses anteriores já viram só subtotais (REGRA 2, migration
-- 0034), isso só encurta a janela de 3 meses pra 0 (ou seja, só o mês
-- atual fica com detalhe; assim que o mês vira, o anterior é arquivado).
-- Mesma função, mesmo corpo, só o cutoff muda — create or replace não
-- precisa reagendar o cron.schedule já existente.
create or replace function public.archive_old_sales()
returns jsonb
language plpgsql
as $$
declare
  cutoff date := date_trunc('month', now())::date;
  store record;
  results jsonb := '[]'::jsonb;
begin
  for store in select id from public.stores loop
    results := results || jsonb_build_array(public.archive_old_sales_for_store(store.id, cutoff));
  end loop;
  return jsonb_build_object('cutoff', cutoff, 'results', results);
end;
$$;
