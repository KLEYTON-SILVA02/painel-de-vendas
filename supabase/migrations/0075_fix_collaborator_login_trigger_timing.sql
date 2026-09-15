-- 0074 tentou resolver a colisão checando new.raw_app_meta_data no próprio
-- INSERT de auth.users — mas isso NÃO funcionou em produção: o Supabase Auth
-- grava o app_metadata que a Admin API recebe através de um passo separado
-- (fora do INSERT inicial da linha), então a trigger AFTER INSERT roda antes
-- desse metadado existir e `new.raw_app_meta_data ? 'collaborator_login'`
-- sempre dava falso, mesmo com grant-collaborator-login/create-collaborator
-- já enviando app_metadata.collaborator_login = true — confirmado ao vivo:
-- uma nova loja fantasma continuou sendo criada depois da 0074 (limpa por
-- esta migration).
--
-- Fix real: checar o e-mail em si, não o metadata. O e-mail sintético do
-- colaborador é montado nas duas edge functions como
-- `<matricula>@<store_id>.colaborador.painel.local` e já está definitivamente
-- presente no INSERT (é a própria coluna que o dispara) — não depende de
-- nenhum passo posterior. Mantém a checagem de app_metadata como segunda
-- camada (não atrapalha, e cobre o caso de algum dia o Auth passar a setar
-- esse campo já no INSERT).
create or replace function public.handle_new_admin_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_store_id uuid;
begin
  if new.raw_app_meta_data ? 'collaborator_login' or new.email like '%.colaborador.painel.local' then
    return new;
  end if;

  select id into v_store_id from public.stores where admin_email = new.email;

  if v_store_id is null then
    insert into public.stores (admin_email)
    values (new.email)
    returning id into v_store_id;

    insert into public.store_settings (store_id)
    values (v_store_id)
    on conflict (store_id) do nothing;
  end if;

  insert into public.profiles (id, store_id, role)
  values (new.id, v_store_id, 'admin')
  on conflict (id) do nothing;

  return new;
end;
$function$;
