-- Desempenho (auditoria de 2026-11-11, item M3): as regras de acesso (RLS) chamavam
-- current_store_id() / is_admin() / auth.uid() uma vez POR LINHA lida. Cada chamada
-- de current_store_id() faz uma junção profiles × stores — numa página de 1.000
-- vendas isso custava ~62 ms no banco (medido), contra ~2 ms quando a função é
-- calculada uma única vez por consulta.
--
-- Correção: embrulhar essas chamadas em (select ...) — o Postgres passa a calcular
-- o valor uma vez (initplan) e reutilizar. O resultado de segurança é idêntico: as
-- funções são STABLE e dependem só de auth.uid(), que não muda durante uma consulta.
-- Medido antes de aplicar, em transação desfeita: 62 ms -> 2 ms por página de
-- 1.000 vendas, e as contagens visíveis por 6 perfis (admin/colaborador de cada loja,
-- admin sem loja ativa e anon) em todas as tabelas ficaram idênticas.
--
-- Gera um ALTER POLICY por política afetada, só no esquema public. Pode rodar de
-- novo sem efeito colateral: chamadas já embrulhadas são preservadas.
do $$
declare
  p record;
  fn text;
  fns text[] := array['current_store_id', 'is_admin', 'current_collaborator_id', 'current_collaborator_matricula', 'is_platform_builder'];
  q text;
  w text;
  alterado int := 0;
  stmt text;
begin
  -- só embrulha funções STABLE/IMMUTABLE (nunca uma VOLATILE: mudaria o significado)
  foreach fn in array fns loop
    if exists (
      select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
      where n.nspname = 'public' and pr.proname = fn and pr.provolatile = 'v'
    ) then
      raise exception 'função % é VOLATILE — não pode ser embrulhada em (select ...)', fn;
    end if;
  end loop;

  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    q := p.qual;
    w := p.with_check;

    -- 1) protege o que já estava embrulhado
    foreach fn in array fns loop
      q := regexp_replace(q, '\( ?SELECT (public\.)?' || fn || '\(\) AS ' || fn || '\)', '@@' || fn || '@@', 'gi');
      w := regexp_replace(w, '\( ?SELECT (public\.)?' || fn || '\(\) AS ' || fn || '\)', '@@' || fn || '@@', 'gi');
    end loop;
    q := regexp_replace(q, '\( ?SELECT auth\.uid\(\) AS uid\)', '@@authuid@@', 'gi');
    w := regexp_replace(w, '\( ?SELECT auth\.uid\(\) AS uid\)', '@@authuid@@', 'gi');

    -- 2) embrulha o que sobrou
    foreach fn in array fns loop
      q := regexp_replace(q, '\m(public\.)?' || fn || '\(\)', '@@' || fn || '@@', 'g');
      w := regexp_replace(w, '\m(public\.)?' || fn || '\(\)', '@@' || fn || '@@', 'g');
    end loop;
    q := regexp_replace(q, 'auth\.uid\(\)', '@@authuid@@', 'g');
    w := regexp_replace(w, 'auth\.uid\(\)', '@@authuid@@', 'g');

    -- 3) restaura já embrulhado
    foreach fn in array fns loop
      q := replace(q, '@@' || fn || '@@', '( SELECT public.' || fn || '() AS ' || fn || ')');
      w := replace(w, '@@' || fn || '@@', '( SELECT public.' || fn || '() AS ' || fn || ')');
    end loop;
    q := replace(q, '@@authuid@@', '( SELECT auth.uid() AS uid)');
    w := replace(w, '@@authuid@@', '( SELECT auth.uid() AS uid)');

    if q is not distinct from p.qual and w is not distinct from p.with_check then
      continue;
    end if;

    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then stmt := stmt || format(' using (%s)', q); end if;
    if w is not null then stmt := stmt || format(' with check (%s)', w); end if;
    execute stmt;
    alterado := alterado + 1;
  end loop;

  raise notice '0114: % políticas atualizadas', alterado;
end $$;
