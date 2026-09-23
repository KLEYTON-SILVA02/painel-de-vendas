-- DSM: encurta o nome padrão de 'DSM (Desconto Só Meu)' para apenas 'DSM'
-- em todo lugar que o exibe (Sidebar, mobile, Galeria de Conquistas, Nomes
-- das Categorias, etc. — todos leem category_types.nome). Só atualiza lojas
-- que ainda estão no valor padrão semeado por 0088 — uma loja que já
-- renomeou o próprio DSM (ADM > Nomes das Categorias) mantém sua escolha.
update public.category_types
set nome = 'DSM'
where chave = 'dsm' and nome = 'DSM (Desconto Só Meu)';

-- Lojas novas (handle_new_admin_user, alterado por 0088) também passam a
-- nascer com o nome curto.
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
    insert into public.stores (admin_email, status)
    values (new.email, 'pending')
    returning id into v_store_id;

    insert into public.store_settings (store_id)
    values (v_store_id)
    on conflict (store_id) do nothing;

    insert into public.category_types (store_id, chave, nome, sistema, ativo)
    values (v_store_id, 'dsm', 'DSM', true, true)
    on conflict (store_id, chave) do nothing;
  end if;

  insert into public.profiles (id, store_id, role)
  values (new.id, v_store_id, 'admin')
  on conflict (id) do nothing;

  return new;
end;
$function$;
