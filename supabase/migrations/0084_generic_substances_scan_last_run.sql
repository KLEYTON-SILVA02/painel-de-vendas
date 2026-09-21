-- Badge "Última varredura" na aba Substâncias (ProdutosPage.tsx) — pedido
-- do usuário depois de eu explicar por que um indicador "rodando agora" não
-- é viável de forma confiável: run_generic_substances_scan() (0083) roda
-- inteira como uma única transação, só fica visível para o resto do
-- sistema no instante em que já comitou — um flag "em andamento" nunca
-- apareceria de fato ligado para um cliente lendo por fora, e o ciclo
-- inteiro (todas as lojas) leva só ~2-3s mesmo. Em vez disso, cada loja
-- passa a guardar quando a última varredura rodou e quantos produtos ela
-- encontrou — sempre correto, sempre visível, sem prometer um "ao vivo"
-- que não é real.

alter table public.store_settings
  add column substances_scan_last_run timestamptz,
  add column substances_scan_last_count integer not null default 0;

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

    update public.store_settings
    set substances_scan_last_run = now(), substances_scan_last_count = coalesce(v_produtos_count, 0)
    where store_id = v_store.id;

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
