-- REGRA 6: collaborators with no sales in the last 60 days are removed
-- automatically. "No sales in 60 days" only applies to someone who has SOLD
-- before — a brand-new collaborator with zero sales ever is never touched,
-- matching the existing client-side "Inativo" badge logic in
-- ColaboradoresPage.tsx (lastSaleDateFor/daysSince: `days !== null && days
-- >= 60`). sales.matricula is a plain text column, not a foreign key, so
-- deleting a collaborator never touches their historical sales rows — those
-- become unmatched and surface as "OUTROS" in Lista de Vendas.
create or replace function public.remove_inactive_collaborators()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.collaborators c
  using (
    select matricula, store_id, max(data_iso) as last_sale
    from public.sales
    where data_iso is not null
    group by matricula, store_id
  ) s
  where s.matricula = c.matricula
    and s.store_id = c.store_id
    and s.last_sale < (current_date - 60);
end;
$$;

create extension if not exists pg_cron with schema cron;

select cron.schedule(
  'remove-inactive-collaborators',
  '0 3 * * *',
  $$select public.remove_inactive_collaborators();$$
)
where not exists (select 1 from cron.job where jobname = 'remove-inactive-collaborators');
