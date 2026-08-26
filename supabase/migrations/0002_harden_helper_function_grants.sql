-- These helper functions back RLS policies and must stay executable by
-- `authenticated` (policies evaluate under the connecting role), but there is
-- no reason for anonymous/unauthenticated callers to invoke them directly.
revoke execute on function public.current_store_id() from public, anon;
revoke execute on function public.current_role() from public, anon;
revoke execute on function public.current_collaborator_id() from public, anon;
revoke execute on function public.current_collaborator_matricula() from public, anon;
revoke execute on function public.is_admin() from public, anon;

grant execute on function public.current_store_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.current_collaborator_id() to authenticated;
grant execute on function public.current_collaborator_matricula() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- handle_new_admin_user is a trigger function; it has no legitimate direct caller.
revoke execute on function public.handle_new_admin_user() from public, anon, authenticated;
