-- Galeria de Conquistas: per-collaborator "Super Meta Individual" per
-- category (DERM/GEN/MP), used only for achievement detection. Deliberately
-- a separate table from individual_goals.valor_super — that field drives the
-- Metas screen's redistribution math, this one is a fixed personal
-- achievement threshold with no relation to goal redistribution (matches
-- legacy's DB.superMetaIndividual being its own dictionary, not reusing
-- DB.goals' individual-goal structure).
create table public.conquista_super_metas (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  categoria text not null check (categoria in ('DERM', 'GEN', 'MP')),
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  valor numeric not null default 0,
  unique (store_id, categoria, collaborator_id)
);

alter table public.conquista_super_metas enable row level security;

create index conquista_super_metas_collaborator_id_idx on public.conquista_super_metas(collaborator_id);

-- Same shape as individual_goals' policies: admin has full CRUD scoped to
-- their store; a collaborator can read their own row.
create policy conquista_super_metas_select on public.conquista_super_metas for select
  using (
    (public.is_admin() and store_id = public.current_store_id())
    or collaborator_id = public.current_collaborator_id()
  );
create policy conquista_super_metas_insert_admin on public.conquista_super_metas for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy conquista_super_metas_update_admin on public.conquista_super_metas for update
  using (public.is_admin() and store_id = public.current_store_id());
create policy conquista_super_metas_delete_admin on public.conquista_super_metas for delete
  using (public.is_admin() and store_id = public.current_store_id());
