-- Segunda leva da auditoria de segurança (a primeira, migration 0048, corrigiu
-- o achado CRÍTICO). Este arquivo fecha os achados ALTA/MÉDIA restantes:
--
-- 1. resolve_collaborator_email (chamável por anon, sem esse RPC o login de
--    colaborador não existe) ganha rate limiting por IP — sem isso, um
--    atacante podia varrer matrículas em lote e usar a resposta (email
--    resolvido vs. null) como oráculo para descobrir quais matrículas
--    existem em qual loja.
-- 2. individual_goals/conquista_super_metas: a policy de leitura do próprio
--    colaborador já era segura na prática (collaborator_id é uma PK única
--    globalmente, não colide entre lojas), mas não checava store_id
--    explicitamente — belt-and-suspenders, mesmo padrão usado em toda outra
--    policy "is_admin() and store_id = ...".
-- 3. password_requests ganha rate limiting (máx. 3/hora por colaborador) —
--    evita que uma sessão comprometida vire spam de solicitações para o ADM.
-- 4. collaborators: celular/data_nascimento (dados pessoais que só o próprio
--    colaborador e o ADM precisam ver) deixam de ser legíveis por qualquer
--    colega de loja via SELECT direto na tabela — migration 0042 relaxou a
--    visibilidade de collaborators para o Ranking funcionar, mas isso
--    também expôs essas duas colunas a todo mundo da loja sem necessidade.
--    list_store_collaborators() vira o único caminho de leitura em lote,
--    mascarando as duas colunas para quem não é nem admin nem o próprio
--    colaborador da linha.

-- ============ 1. Infraestrutura genérica de rate limiting ============
create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  bucket text not null,
  hit_at timestamptz not null default now()
);
create index rate_limit_hits_bucket_time_idx on public.rate_limit_hits (bucket, hit_at);
-- RLS habilitada sem nenhuma policy: ninguém via PostgREST (anon/authenticated)
-- consegue ler ou escrever aqui diretamente — só funções SECURITY DEFINER,
-- que rodam como dono da tabela e por isso ignoram RLS.
alter table public.rate_limit_hits enable row level security;

create or replace function public.check_rate_limit(p_bucket text, p_max_hits int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  hits int;
begin
  delete from public.rate_limit_hits where bucket = p_bucket and hit_at < now() - make_interval(secs => p_window_seconds);
  select count(*) into hits from public.rate_limit_hits where bucket = p_bucket;
  if hits >= p_max_hits then
    return false;
  end if;
  insert into public.rate_limit_hits (bucket) values (p_bucket);
  return true;
end;
$$;
revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;

-- Melhor identificador disponível para um chamador anônimo: o primeiro IP
-- da cadeia x-forwarded-for que o PostgREST expõe via request.headers. Sem
-- esse header (fora do ambiente normal do Supabase, ex.: psql direto), cai
-- num bucket único — ainda limita o volume total em vez de desligar o
-- controle por completo.
create or replace function public._rate_limit_client_ip()
returns text
language sql stable as $$
  select split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', 'sem-ip'), ',', 1)
$$;

-- ============ 2. resolve_collaborator_email com rate limiting ============
create or replace function public.resolve_collaborator_email(p_matricula text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.check_rate_limit('resolve_collaborator_email:' || public._rate_limit_client_ip(), 20, 300) then
    return null;
  end if;

  return (
    select case when count(*) = 1
      then min(lower(c.matricula) || '@' || c.store_id::text || '.colaborador.painel.local')
      else null end
    from public.collaborators c
    where lower(c.matricula) = lower(trim(p_matricula))
  );
end;
$$;
grant execute on function public.resolve_collaborator_email(text) to anon, authenticated;

-- ============ 3. password_requests: rate limit de 3/hora por colaborador ============
create or replace function public.enforce_password_request_rate_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.check_rate_limit('password_request:' || new.collaborator_id::text, 3, 3600) then
    raise exception 'Muitas solicitações de nova senha em pouco tempo. Aguarde e tente novamente.';
  end if;
  return new;
end;
$$;

drop trigger if exists password_requests_rate_limit on public.password_requests;
create trigger password_requests_rate_limit
  before insert on public.password_requests
  for each row execute function public.enforce_password_request_rate_limit();

-- ============ 4. individual_goals/conquista_super_metas: store_id explícito ============
drop policy if exists individual_goals_select_self on public.individual_goals;
create policy individual_goals_select_self on public.individual_goals
  for select
  using (collaborator_id = public.current_collaborator_id() and store_id = public.current_store_id());

drop policy if exists conquista_super_metas_select on public.conquista_super_metas;
create policy conquista_super_metas_select on public.conquista_super_metas
  for select
  using (
    (public.is_admin() and store_id = public.current_store_id())
    or (collaborator_id = public.current_collaborator_id() and store_id = public.current_store_id())
  );

-- ============ 5. collaborators: mascarar celular/data_nascimento entre colegas ============
create or replace function public.list_store_collaborators()
returns table (
  id uuid,
  store_id uuid,
  matricula text,
  nome text,
  apelido text,
  celular text,
  foto_url text,
  foto_conquista_url text,
  setor text,
  meta_individual numeric,
  data_nascimento date,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.store_id, c.matricula, c.nome, c.apelido,
    case when public.is_admin() or c.id = public.current_collaborator_id() then c.celular else null end,
    c.foto_url, c.foto_conquista_url, c.setor, c.meta_individual,
    case when public.is_admin() or c.id = public.current_collaborator_id() then c.data_nascimento else null end,
    c.created_at
  from public.collaborators c
  where c.store_id = public.current_store_id()
$$;
revoke all on function public.list_store_collaborators() from public, anon;
grant execute on function public.list_store_collaborators() to authenticated;

-- A partir daqui, celular/data_nascimento só saem por list_store_collaborators()
-- (que decide linha a linha se quem pediu pode vê-las) — nenhum SELECT direto
-- na tabela, nem do próprio dono da API REST, devolve essas duas colunas.
revoke select (celular, data_nascimento) on public.collaborators from authenticated;
