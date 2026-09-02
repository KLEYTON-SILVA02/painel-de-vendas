-- Part A, stage 2 of the generic "category type" system: link BIOSINTÉTICA's
-- existing group/goal tables to category_types instead of implicitly
-- assuming BIOSINTÉTICA is the only possible partnership category. Still
-- additive/invisible — a BEFORE INSERT trigger backfills category_type_id
-- for any row that doesn't specify one (i.e. every insert from the current
-- Biosintética-only UI, which doesn't know about category_types yet) by
-- resolving the store's 'biosintetica' row, so no application code changes
-- here and existing behavior is unchanged. Generalizing the grupo CHECK
-- constraints (currently fixed to G1-G4) comes in the stage that builds the
-- generic groups UI, once there's a real reason to insert other codes.

alter table public.bio_groups add column category_type_id uuid references public.category_types(id) on delete cascade;
alter table public.bio_group_goals add column category_type_id uuid references public.category_types(id) on delete cascade;

update public.bio_groups bg
set category_type_id = ct.id
from public.category_types ct
where ct.store_id = bg.store_id and ct.chave = 'biosintetica' and bg.category_type_id is null;

update public.bio_group_goals bgg
set category_type_id = ct.id
from public.category_types ct
where ct.store_id = bgg.store_id and ct.chave = 'biosintetica' and bgg.category_type_id is null;

create or replace function public.fill_bio_category_type_id()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category_type_id is null then
    select id into new.category_type_id
    from public.category_types
    where store_id = new.store_id and chave = 'biosintetica';
  end if;
  return new;
end;
$$;
revoke execute on function public.fill_bio_category_type_id() from public, anon, authenticated;

create trigger bio_groups_fill_category_type
  before insert on public.bio_groups
  for each row execute function public.fill_bio_category_type_id();
create trigger bio_group_goals_fill_category_type
  before insert on public.bio_group_goals
  for each row execute function public.fill_bio_category_type_id();

alter table public.bio_groups alter column category_type_id set not null;
alter table public.bio_group_goals alter column category_type_id set not null;

create index bio_groups_category_type_idx on public.bio_groups(category_type_id);
create index bio_group_goals_category_type_idx on public.bio_group_goals(category_type_id);
