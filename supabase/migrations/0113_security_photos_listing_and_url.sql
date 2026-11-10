-- Auditoria de segurança (itens 9 e 10, prioridade BAIXA).
--
-- Item 9: a policy photos_public_read (SELECT para qualquer um) deixava listar as
-- pastas do bucket sem login. O app nunca lista (.list()) — só envia (upload com
-- upsert) e mostra pela URL pública, que não passa por esta policy porque o bucket é
-- público. A leitura via API fica só para quem está logado e dentro da pasta da
-- própria loja (todo caminho começa com o id da loja — ver src/lib/storage.ts), que é
-- o que o upsert precisa para enxergar o arquivo que vai substituir.
drop policy if exists photos_public_read on storage.objects;
create policy photos_store_read on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (public.current_store_id())::text);

-- Item 10: update_own_collaborator_photo gravava qualquer texto como URL da foto —
-- dava para apontar a própria foto para um endereço externo (rastreio de quem abre o
-- ranking, imagem imprópria hospedada fora). Só URLs do bucket photos deste projeto.
create or replace function public.update_own_collaborator_photo(new_foto_url text, new_foto_conquista_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prefixo constant text := 'https://evpuqqjqbpoqxzaguinr.supabase.co/storage/v1/object/public/photos/';
  u text;
begin
  foreach u in array array[new_foto_url, new_foto_conquista_url] loop
    if u is not null and (left(u, length(prefixo)) <> prefixo or position('..' in u) > 0) then
      raise exception 'URL de foto inválida' using errcode = '22023';
    end if;
  end loop;

  update public.collaborators
  set
    foto_url = coalesce(new_foto_url, foto_url),
    foto_conquista_url = coalesce(new_foto_conquista_url, foto_conquista_url)
  where id = public.current_collaborator_id();
end;
$$;
