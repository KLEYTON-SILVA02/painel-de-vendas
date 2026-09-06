-- "Visitante" — a new `collaborators.setor` value (checked as a plain
-- string throughout the app, same pattern as BALCAO_SETOR) for someone
-- registered only to look at a fixed set of categories read-only: no sales
-- ever get tied to them (their matrícula just never appears in an import),
-- and once logged in (via the normal collaborator matrícula+senha flow)
-- they see only the category screens the ADM checked at registration
-- instead of the usual Metas/Vendas/Ranking/Comissões/Dinâmicas tabs.
--
-- categorias_visitante stores category keys as plain text — the fixed
-- ones (DERM/GEN/MP/MER/LEVMEL/CHIP) and, for stores that have it,
-- 'biosintetica' — rather than a foreign key, since the fixed six aren't
-- rows in any table.
alter table public.collaborators
  add column categorias_visitante text[] not null default '{}';

-- list_store_collaborators() (migration 0050) is the only bulk read path
-- left open after the column-grant fix (0051) — extend it to carry the new
-- column through. Not sensitive data, so no per-row masking needed here
-- (unlike celular/data_nascimento in the same function).
-- create or replace can't change a function's RETURNS TABLE column list —
-- must drop first since this adds a column to the signature.
drop function public.list_store_collaborators();
create function public.list_store_collaborators()
returns table (
  id uuid,
  store_id uuid,
  matricula text,
  nome text,
  apelido text,
  celular text,
  foto_url text,
  foto_conquista_url text,
  setor text,
  meta_individual numeric,
  data_nascimento date,
  categorias_visitante text[],
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.store_id, c.matricula, c.nome, c.apelido,
    case when public.is_admin() or c.id = public.current_collaborator_id() then c.celular else null end,
    c.foto_url, c.foto_conquista_url, c.setor, c.meta_individual,
    case when public.is_admin() or c.id = public.current_collaborator_id() then c.data_nascimento else null end,
    c.categorias_visitante,
    c.created_at
  from public.collaborators c
  where c.store_id = public.current_store_id()
$$;
-- DROP FUNCTION also drops its grants (migration 0050) — reapply them.
revoke all on function public.list_store_collaborators() from public, anon;
grant execute on function public.list_store_collaborators() to authenticated;
