-- Mercadoria Geral agora também tem comissão configurável, igual
-- Dermocosméticos/Genéricos/Marcas Exclusivas — só faltava liberar o CHECK
-- que restringia commission_rates.categoria às outras três.
alter table public.commission_rates drop constraint commission_rates_categoria_check;
alter table public.commission_rates add constraint commission_rates_categoria_check check (categoria in ('MER', 'DERM', 'GEN', 'MP'));
