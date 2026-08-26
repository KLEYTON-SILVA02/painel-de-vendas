-- Collaborator avatars and the store logo. Public-read (these are just staff
-- photos/branding, not sensitive), admin-write scoped by store via the
-- object path convention: {store_id}/collaborators/{collaborator_id}.<ext>
-- and {store_id}/logo.<ext>.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy photos_public_read on storage.objects for select
  using (bucket_id = 'photos');

create policy photos_admin_write on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.current_store_id()::text
  );

create policy photos_admin_update on storage.objects for update
  using (
    bucket_id = 'photos'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.current_store_id()::text
  );

create policy photos_admin_delete on storage.objects for delete
  using (
    bucket_id = 'photos'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.current_store_id()::text
  );
