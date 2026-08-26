-- Collaborators log in with matricula+senha, but Supabase Auth only knows
-- email+password. This lets the (unauthenticated) login page resolve a
-- matricula to its synthetic, store-scoped login email before calling
-- signInWithPassword. It reveals nothing beyond "a login email exists for
-- this matricula" (same class of information any login form leaks), and
-- returns null on an ambiguous match (the same matricula registered in more
-- than one store) rather than guessing — ambiguity across stores can only
-- happen once self-service multi-store signup exists, which it doesn't yet.
create or replace function public.resolve_collaborator_email(p_matricula text)
returns text
language sql stable security definer set search_path = public as $$
  select case when count(*) = 1
    then min(lower(c.matricula) || '@' || c.store_id::text || '.colaborador.painel.local')
    else null end
  from public.collaborators c
  where lower(c.matricula) = lower(trim(p_matricula))
$$;

grant execute on function public.resolve_collaborator_email(text) to anon, authenticated;
