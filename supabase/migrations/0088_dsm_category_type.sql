-- DSM Fase 4: dá ao DSM (Desconto Só Meu) sua própria tela/ranking, acessível
-- pelo menu lateral, com a opção de ocultar pedida desde o início (ver o
-- requisito original em ImportarPage/dsm_records, Fase 1). Diferente de
-- BIOSINTÉTICA (sistema legado, só existe nas lojas em que foi semeado
-- manualmente em 0024_category_types.sql), DSM é uma dinâmica genérica de
-- farmácia — toda loja recebe automaticamente sua própria linha em
-- category_types (chave 'dsm'), tanto as já existentes (backfill abaixo)
-- quanto as futuras (handle_new_admin_user, alterado abaixo).
--
-- `sistema = true` (não aparece/não pode ser apagada em Gerenciar
-- Categorias — mesmo motivo de biosintetica: não é uma categoria que o ADM
-- criou, é parte do próprio sistema). `ativo = true` por padrão — nasce
-- visível; a Sidebar abaixo (aplicação em código, não nesta migration) é
-- que respeita `ativo = false` para ocultar, e o toggle correspondente fica
-- em Importar Vendas (sempre alcançável, mesmo com o item oculto do menu).
insert into public.category_types (store_id, chave, nome, sistema, ativo)
select id, 'dsm', 'DSM (Desconto Só Meu)', true, true
from public.stores
on conflict (store_id, chave) do nothing;

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
    values (v_store_id, 'dsm', 'DSM (Desconto Só Meu)', true, true)
    on conflict (store_id, chave) do nothing;
  end if;

  insert into public.profiles (id, store_id, role)
  values (new.id, v_store_id, 'admin')
  on conflict (id) do nothing;

  return new;
end;
$function$;
