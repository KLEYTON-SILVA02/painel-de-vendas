-- Varredura automática de Substâncias (Genéricos) — pedido do usuário: em
-- vez de depender do ADM clicar manualmente em "Aplicar / Escanear"
-- (SubstanciasTab, src/routes/admin/ProdutosPage.tsx), roda sozinha 5x por
-- dia em horários fixos: 07:00, 10:00, 15:00, 18:00, 22:00
-- (America/Sao_Paulo). O botão manual continua existindo e funcionando
-- exatamente como antes — esta é só uma segunda via de disparo.
--
-- Reaproveita a mesma lógica de duas partes que useReclassifyProdutos já
-- usa no cliente (upsert em catalog + retroagir sales.grupo), portada para
-- SQL no mesmo espírito de apply_catalog_correction (0078) — casamento por
-- public.normalize_text, comparando contra o grupo persistido (mesmo
-- princípio do fix do scanner de Palavras-chave desta sessão: nunca
-- recalcular do zero, sempre comparar com o que já está gravado).
--
-- Idempotente por natureza, sem precisar de coluna de dedupe "já rodou
-- hoje" (diferente de run_catalog_group_scan, 0081): uma vez que um
-- produto entra no Catálogo, o próprio "not exists" abaixo o exclui de
-- qualquer varredura futura — rodar de novo no mesmo dia não duplica nada.
--
-- Quando a loja pertence a um modelo_catalogo, os produtos recém-inseridos
-- também alimentam catalog_shared_library — o trigger de propagação
-- (0082_catalog_shared_library_propagation.sql) então cuida sozinho de
-- levar isso para as lojas irmãs, sem código extra aqui.
--
-- Fuso único assumido (America/Sao_Paulo, sem horário de verão desde 2019)
-- — mesma suposição já documentada em dispatch_sales_notifications e
-- archive_old_sales_for_store. Os 5 horários locais viram estes 5 jobs
-- pg_cron, cada um em UTC = horário local + 3h.
--
-- normalize_text sempre chamada como public.normalize_text (nunca sem
-- qualificar) dentro desta função: uma security definer function não
-- resolve o nome sem o schema mesmo com search_path incluindo 'public' —
-- comportamento observado ao aplicar a migration 0082 nesta mesma sessão.
--
-- Casamento por regex único (todas as substâncias da loja unidas por "|"),
-- não por um EXISTS/LIKE por substância: testado com dados reais da Loja
-- 7152 (7983 produtos distintos x 339 substâncias) — a versão ingênua
-- (LIKE por substância dentro de um EXISTS) forçava um nested loop de ~2,15
-- milhões de combinações e levava ~15s; o regex único faz uma passada por
-- produto e caiu para ~2,2s. Nomes de substância são escapados
-- (regexp_replace) antes de entrar no padrão, já que vêm de texto livre
-- cadastrado pelo ADM e podem conter caracteres especiais de regex.

create or replace function public.run_generic_substances_scan()
returns jsonb
language plpgsql
security definer
set search_path to 'public, extensions'
as $$
declare
  v_store record;
  v_pattern text;
  v_produtos_count int;
  v_vendas_count int;
  v_total_produtos int := 0;
  v_total_vendas int := 0;
  v_lojas_processadas int := 0;
begin
  for v_store in select id, modelo_catalogo from public.stores where status = 'active' loop
    select string_agg(regexp_replace(public.normalize_text(nome), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '|')
      into v_pattern
    from public.generic_substances
    where store_id = v_store.id and length(public.normalize_text(nome)) >= 3;

    if v_pattern is null then
      continue;
    end if;

    with produtos_distintos as (
      select distinct on (public.normalize_text(s.produto))
        s.produto, public.normalize_text(s.produto) as n, s.grupo
      from public.sales s
      where s.store_id = v_store.id and s.produto is not null
      order by public.normalize_text(s.produto), s.data_iso desc nulls last
    ),
    candidatos as (
      select pd.produto, pd.n
      from produtos_distintos pd
      where pd.grupo is distinct from 'GEN'
        and pd.n ~ v_pattern
        and not exists (
          select 1 from public.catalog c
          where c.store_id = v_store.id and public.normalize_text(c.nome) = pd.n
        )
    ),
    inseridos as (
      insert into public.catalog (store_id, nome, codigo, categoria, origem)
      select v_store.id, c.produto, null, 'GEN', 'substancia' from candidatos c
      returning nome, public.normalize_text(nome) as n
    ),
    atualizadas as (
      update public.sales s
      set grupo = 'GEN'
      from inseridos i
      where s.store_id = v_store.id
        and s.grupo is distinct from 'GEN'
        and public.normalize_text(s.produto) = i.n
      returning 1
    ),
    compartilhados as (
      insert into public.catalog_shared_library (modelo_catalogo, nome, nome_normalizado, categoria)
      select v_store.modelo_catalogo, i.nome, i.n, 'GEN'
      from inseridos i
      where v_store.modelo_catalogo is not null
      on conflict (modelo_catalogo, nome_normalizado) do nothing
      returning 1
    )
    select (select count(*) from inseridos), (select count(*) from atualizadas)
    into v_produtos_count, v_vendas_count;

    v_lojas_processadas := v_lojas_processadas + 1;
    v_total_produtos := v_total_produtos + coalesce(v_produtos_count, 0);
    v_total_vendas := v_total_vendas + coalesce(v_vendas_count, 0);
  end loop;

  return jsonb_build_object(
    'checked_at', now(),
    'lojas_processadas', v_lojas_processadas,
    'produtos_inseridos', v_total_produtos,
    'vendas_atualizadas', v_total_vendas
  );
end;
$$;

revoke execute on function public.run_generic_substances_scan() from public, anon, authenticated;

-- cron.schedule upserta pelo nome do job, então rodar esta migração de novo
-- é seguro. 07:00/10:00/15:00/18:00/22:00 America/Sao_Paulo = 10:00/13:00/
-- 18:00/21:00/01:00 UTC.
select cron.schedule('generic-substances-scan-07', '0 10 * * *', $$select public.run_generic_substances_scan();$$);
select cron.schedule('generic-substances-scan-10', '0 13 * * *', $$select public.run_generic_substances_scan();$$);
select cron.schedule('generic-substances-scan-15', '0 18 * * *', $$select public.run_generic_substances_scan();$$);
select cron.schedule('generic-substances-scan-18', '0 21 * * *', $$select public.run_generic_substances_scan();$$);
select cron.schedule('generic-substances-scan-22', '0 1 * * *', $$select public.run_generic_substances_scan();$$);
