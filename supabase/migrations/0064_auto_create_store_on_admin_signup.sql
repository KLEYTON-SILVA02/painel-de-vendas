-- Antes: handle_new_admin_user() só vinculava o profile a uma loja que já
-- existisse com admin_email correspondente. Um cliente novo criando conta
-- pela primeira vez nunca tinha uma loja pré-cadastrada, então nenhum
-- profile era criado e o app ficava travado para sempre em "Preparando sua
-- conta..." (AppShell trava enquanto profile for null, sem retry).
--
-- Agora: se não existir loja com esse admin_email, a própria trigger cria a
-- loja (e sua store_settings, já que nada mais cria essa linha) antes de
-- vincular o profile.
create or replace function public.handle_new_admin_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_store_id uuid;
begin
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
