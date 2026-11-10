-- Auditoria de segurança (item 3, prioridade MÉDIA).
--
-- 1) _rate_limit_client_ip usava o PRIMEIRO valor de x-forwarded-for, que é o que o
--    próprio cliente manda: bastava trocar esse cabeçalho a cada chamada para nunca
--    bater no limite. Testado contra este projeto antes de mudar: uma chamada com
--    "X-Forwarded-For: 1.2.3.4, 9.9.9.9" chega ao banco como
--    "1.2.3.4, 9.9.9.9,<IP real>" — o proxy só ACRESCENTA o IP real no fim — e
--    cf-connecting-ip chega com o IP real; mandar um cf-connecting-ip falso faz a
--    Cloudflare recusar a chamada inteira (403) antes de chegar aqui. Então:
--    cf-connecting-ip primeiro, e o ÚLTIMO valor de x-forwarded-for como reserva.
create or replace function public._rate_limit_client_ip()
returns text
language sql
stable
set search_path = public
as $$
  with h as (
    select nullif(current_setting('request.headers', true), '')::json as j
  ), x as (
    select j, string_to_array(j ->> 'x-forwarded-for', ',') as xff from h
  )
  select coalesce(
    nullif(btrim(j ->> 'cf-connecting-ip'), ''),
    nullif(btrim(xff[array_upper(xff, 1)]), ''),
    'sem-ip'
  )
  from x
$$;

-- 2) Limite também por alvo (o usuário/matrícula consultado), independente do IP:
--    quem distribui as tentativas por vários IPs continuava sem limite nenhum sobre
--    uma mesma conta. 10 consultas por alvo a cada 5 minutos (um login normal faz 1).
create or replace function public.resolve_admin_email(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo text := lower(trim(coalesce(p_username, '')));
begin
  if not public.check_rate_limit('resolve_admin_email:' || public._rate_limit_client_ip(), 20, 300) then
    return null;
  end if;
  if alvo <> '' and not public.check_rate_limit('resolve_admin_email_alvo:' || alvo, 10, 300) then
    return null;
  end if;

  return (
    select case when count(*) = 1
      then min(u.email)
      else null end
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'admin' and lower(p.username) = alvo
  );
end;
$$;

create or replace function public.resolve_collaborator_email(p_matricula text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo text := lower(trim(coalesce(p_matricula, '')));
begin
  if not public.check_rate_limit('resolve_collaborator_email:' || public._rate_limit_client_ip(), 20, 300) then
    return null;
  end if;
  if alvo <> '' and not public.check_rate_limit('resolve_collaborator_email_alvo:' || alvo, 10, 300) then
    return null;
  end if;

  return (
    select case when count(*) = 1
      then min(lower(c.matricula) || '@' || c.store_id::text || '.colaborador.painel.local')
      else null end
    from public.collaborators c
    where lower(c.matricula) = alvo
       or lower(c.username) = alvo
  );
end;
$$;
