-- Colaborador: nome de usuário de login separado da matrícula.
--
-- A matrícula é a chave usada para casar vendas importadas de planilha com
-- o colaborador certo (normalização de zero à esquerda, etc.) — deixar o
-- colaborador editar a própria matrícula quebraria esse casamento
-- histórico. Este `username` é um campo novo, só para login, que o
-- colaborador pode trocar livremente em Configurações sem afetar nada mais.
alter table public.collaborators add column username text;

-- Único (case-insensitive) entre quem já definiu um username — evita que
-- duas trocas concorrentes escolham o mesmo nome (a checagem feita na RPC
-- abaixo, sozinha, teria uma janela de corrida entre o select e o update).
create unique index collaborators_username_lower_idx on public.collaborators (lower(username)) where username is not null;

-- Self-service: troca APENAS o username do próprio colaborador (nunca a
-- matrícula). Valida formato e garante que o novo nome não colide com
-- nenhuma matrícula ou username já existente — essa colisão é justamente o
-- que faria resolve_collaborator_email (abaixo) ficar ambíguo e recusar o
-- login de ambos.
create or replace function public.update_own_collaborator_username(new_username text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_username text := lower(trim(new_username));
begin
  if public.current_collaborator_id() is null then
    raise exception 'not a collaborator';
  end if;
  if v_username is null or v_username = '' then
    raise exception 'Informe um nome de usuário.';
  end if;
  if length(v_username) < 3 or length(v_username) > 32 then
    raise exception 'O nome de usuário deve ter entre 3 e 32 caracteres.';
  end if;
  if v_username !~ '^[a-z0-9._-]+$' then
    raise exception 'Use apenas letras, números, ponto, traço ou underline.';
  end if;
  if exists (
    select 1 from public.collaborators
    where id <> public.current_collaborator_id()
      and (lower(matricula) = v_username or lower(username) = v_username)
  ) then
    raise exception 'Esse nome de usuário já está em uso.';
  end if;

  update public.collaborators set username = v_username where id = public.current_collaborator_id();
end;
$$;

revoke execute on function public.update_own_collaborator_username(text) from public, anon;
grant execute on function public.update_own_collaborator_username(text) to authenticated;

-- resolve_collaborator_email: agora aceita matrícula OU username no mesmo
-- campo — o formulário de login continua com um único input, sem mudança
-- de UX, apenas aceitando mais um valor válido para o mesmo colaborador.
create or replace function public.resolve_collaborator_email(p_matricula text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
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
       or lower(c.username) = lower(trim(p_matricula))
  );
end;
$function$;

-- list_store_collaborators: expõe o username para a própria ADM (suporte a
-- colaborador que esqueceu o que escolheu). Precisa ser recriada (não só
-- substituída) porque adiciona uma coluna à assinatura de retorno.
drop function public.list_store_collaborators();

create function public.list_store_collaborators()
returns table (
  id uuid, store_id uuid, matricula text, username text, nome text, apelido text, celular text,
  foto_url text, foto_conquista_url text, setor text, meta_individual numeric,
  data_nascimento date, categorias_visitante text[], created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    c.id, c.store_id, c.matricula, c.username, c.nome, c.apelido,
    case when public.is_admin() or c.id = public.current_collaborator_id() then c.celular else null end,
    c.foto_url, c.foto_conquista_url, c.setor, c.meta_individual,
    case when public.is_admin() or c.id = public.current_collaborator_id() then c.data_nascimento else null end,
    c.categorias_visitante,
    c.created_at
  from public.collaborators c
  where c.store_id = public.current_store_id()
$$;

revoke all on function public.list_store_collaborators() from public, anon;
grant execute on function public.list_store_collaborators() to authenticated;
