-- Bug real de produção: toda vez que grant-collaborator-login (ou
-- create-collaborator) cria o login do colaborador via
-- auth.admin.createUser(), a trigger on_auth_user_created_bind_admin
-- (handle_new_admin_user, migration 0064) também dispara para esse novo
-- auth.users — ela não tinha como saber que aquele usuário não é uma ADM se
-- cadastrando pela primeira vez. Como o e-mail sintético do colaborador
-- (`<matricula>@<store_id>.colaborador.painel.local`) nunca bate com
-- nenhum stores.admin_email, a trigger criava uma LOJA FANTASMA (+
-- store_settings) para esse e-mail e um profile role='admin' apontando pra
-- ela — e esse profile usa o MESMO id (new.id) que o próprio
-- grant-collaborator-login tenta inserir logo em seguida (role='collaborator',
-- na loja de verdade), causando "duplicate key value violates unique
-- constraint profiles_pkey". O 400 resultante é o que aparecia na tela como
-- "Edge Function returned a non-2xx status code" — "Criar acesso" estava
-- 100% quebrado desde a migration 0064, e cada tentativa deixava uma loja +
-- store_settings órfã para trás.
--
-- Fix: as duas edge functions passam a marcar o createUser() com
-- app_metadata.collaborator_login = true (só o service role consegue setar
-- app_metadata — nunca vem do cliente), e a trigger ignora esses usuários
-- por completo, deixando o profile de colaborador inteiramente por conta do
-- código da própria edge function, como já era a intenção original.
create or replace function public.handle_new_admin_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_store_id uuid;
begin
  if new.raw_app_meta_data ? 'collaborator_login' then
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
