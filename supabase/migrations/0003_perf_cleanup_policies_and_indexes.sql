-- Add indexes for FKs flagged by the advisor.
create index individual_goals_collaborator_id_idx on public.individual_goals(collaborator_id);
create index profiles_collaborator_id_idx on public.profiles(collaborator_id);

-- Consolidate the admin+self SELECT policies into one each, so the planner
-- evaluates a single permissive policy per role/action instead of two.
drop policy collaborators_select_admin on public.collaborators;
drop policy collaborators_select_self on public.collaborators;
create policy collaborators_select on public.collaborators for select
  using (
    (public.is_admin() and store_id = public.current_store_id())
    or id = public.current_collaborator_id()
  );

drop policy sales_select_admin on public.sales;
drop policy sales_select_self on public.sales;
create policy sales_select on public.sales for select
  using (
    (public.is_admin() and store_id = public.current_store_id())
    or (store_id = public.current_store_id() and matricula = public.current_collaborator_matricula())
  );

drop policy individual_goals_select_admin on public.individual_goals;
drop policy individual_goals_select_self on public.individual_goals;
create policy individual_goals_select on public.individual_goals for select
  using (
    (public.is_admin() and store_id = public.current_store_id())
    or collaborator_id = public.current_collaborator_id()
  );

-- Avoid per-row re-evaluation of auth.uid() in the profiles policy.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (
    id = (select auth.uid())
    or (public.is_admin() and store_id = public.current_store_id())
  );
