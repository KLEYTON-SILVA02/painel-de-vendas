-- Lets a collaborator update ONLY their own foto_url/foto_conquista_url —
-- everything else on `collaborators` (matricula, setor, meta_individual...)
-- stays admin-only, so this is a narrow SECURITY DEFINER function instead of
-- a blanket self-UPDATE RLS policy (which would let a collaborator edit any
-- column on their own row via a hand-crafted REST call, not just photos).
create or replace function public.update_own_collaborator_photo(new_foto_url text, new_foto_conquista_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.collaborators
  set
    foto_url = coalesce(new_foto_url, foto_url),
    foto_conquista_url = coalesce(new_foto_conquista_url, foto_conquista_url)
  where id = public.current_collaborator_id();
end;
$$;

revoke execute on function public.update_own_collaborator_photo(text, text) from public, anon;
grant execute on function public.update_own_collaborator_photo(text, text) to authenticated;
