-- Collaborator self-service photo upload (own avatar + own Galeria de
-- Conquistas photo), for the new "Configurações" screen in the collaborator
-- mobile app. Previously only an admin could write to the `photos` bucket
-- at all (photos_admin_write/update). Scoped strictly to the collaborator's
-- own object path — {store_id}/collaborators/{collaborator_id}[-conquista].*
-- — via a `like` prefix match: a collaborator_id is a fixed-length UUID, so
-- no other collaborator's path can share this prefix.
create policy photos_collaborator_self_write on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and public.current_collaborator_id() is not null
    and name like (public.current_store_id()::text || '/collaborators/' || public.current_collaborator_id()::text || '%')
  );

create policy photos_collaborator_self_update on storage.objects for update
  using (
    bucket_id = 'photos'
    and public.current_collaborator_id() is not null
    and name like (public.current_store_id()::text || '/collaborators/' || public.current_collaborator_id()::text || '%')
  );
