-- ADM: login por nome de usuário, além do e-mail.
--
-- Diferente do colaborador (que nunca teve e-mail próprio, daí o domínio
-- sintético), o ADM já tem um e-mail real cadastrado no signup — esse
-- e-mail continua existindo só para recuperação de senha. `username` é um
-- campo novo e opcional em `profiles`, único (case-insensitive) entre
-- quem já escolheu um.
alter table public.profiles add column username text;

create unique index profiles_username_lower_idx on public.profiles (lower(username)) where username is not null;

-- Self-service: só um admin pode chamar (is_admin() aqui evita expor essa
-- RPC a colaboradores, que não têm — nem devem ter — este conceito).
-- Mesmas validações de formato/colisão de update_own_collaborator_username.
create or replace function public.update_own_admin_username(new_username text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_username text := lower(trim(new_username));
begin
  if not public.is_admin() then
    raise exception 'not an admin';
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
    select 1 from public.profiles
    where id <> auth.uid() and lower(username) = v_username
  ) then
    raise exception 'Esse nome de usuário já está em uso.';
  end if;

  update public.profiles set username = v_username where id = auth.uid();
end;
$$;

revoke execute on function public.update_own_admin_username(text) from public, anon;
grant execute on function public.update_own_admin_username(text) to authenticated;

-- resolve_admin_email: mesmo papel de resolve_collaborator_email, mas para
-- ADM — traduz um username em texto simples para o e-mail real por trás
-- dele, sem revelar se o username existe (contagem ambígua -> null) nem
-- deixar alguém varrer usernames (rate limit compartilhado com o mesmo
-- mecanismo). Login por e-mail continua funcionando direto pelo Supabase
-- Auth (signInWithPassword aceita e-mail sem passar por aqui) — esta RPC
-- só entra em cena quando o texto digitado não é um e-mail.
create or replace function public.resolve_admin_email(p_username text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.check_rate_limit('resolve_admin_email:' || public._rate_limit_client_ip(), 20, 300) then
    return null;
  end if;

  return (
    select case when count(*) = 1
      then min(u.email)
      else null end
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'admin' and lower(p.username) = lower(trim(p_username))
  );
end;
$$;

revoke execute on function public.resolve_admin_email(text) from public, anon;
grant execute on function public.resolve_admin_email(text) to anon, authenticated;
