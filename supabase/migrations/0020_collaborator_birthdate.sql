-- Adds a birth-date field to collaborators, replacing the "Meta individual"
-- field in the admin edit-profile modal (that goal is still editable via
-- the dedicated Metas screens — see MetasPage.tsx / MetasVendasPage.tsx —
-- this column just gives the profile form a new field to show instead).
alter table public.collaborators
  add column if not exists data_nascimento date;
