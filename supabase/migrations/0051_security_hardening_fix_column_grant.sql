-- A revoke de coluna sozinha (migration 0050) não bastou: o Supabase já
-- concede select de TABELA INTEIRA a authenticated/anon por padrão
-- (grant select on all tables in schema public), e esse grant de tabela
-- cobre todas as colunas independente de qualquer revoke por coluna —
-- confirmado consultando information_schema.column_privileges após a
-- migration anterior, que ainda mostrava authenticated com SELECT em
-- celular/data_nascimento. A forma correta de restringir por coluna é
-- revogar o SELECT de tabela inteira e conceder de volta apenas as colunas
-- não sensíveis.
revoke select on public.collaborators from authenticated, anon;
grant select (
  id, store_id, matricula, nome, apelido,
  foto_url, foto_conquista_url, setor, meta_individual, created_at
) on public.collaborators to authenticated;
