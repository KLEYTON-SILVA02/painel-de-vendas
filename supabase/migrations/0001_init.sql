-- Painel de Gestão de Vendas — initial schema
-- Multi-tenant (store-scoped) schema mirroring the legacy index.html data model
-- (window.storage's defaultState()), plus real auth: a single fixed ADM account
-- per store (bound by email via trigger) and collaborators (matricula+senha,
-- provisioned by an edge function using the service role).

-- ============ STORES ============
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null unique,
  nome_loja text not null default '',
  numero_loja text not null default '',
  nome_equipe text not null default 'Equipe',
  logo_url text,
  mensagem text not null default '',
  created_at timestamptz not null default now()
);

-- ============ COLLABORATORS ============
create table public.collaborators (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  matricula text not null,
  nome text not null,
  apelido text,
  setor text,
  foto_url text,
  meta_individual numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, matricula)
);

-- ============ PROFILES (auth.users <-> store/role/collaborator link) ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  role text not null check (role in ('admin', 'collaborator')),
  collaborator_id uuid references public.collaborators(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint profiles_collaborator_requires_role check (collaborator_id is null or role = 'collaborator')
);
create index profiles_store_id_idx on public.profiles(store_id);

-- ============ SALES ============
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  data_raw text,
  data_iso date,
  matricula text not null,
  vendedor text not null default '',
  produto text not null,
  codigo text,
  qtd numeric not null default 0,
  valor numeric not null default 0,
  grupo text check (grupo in ('DERM', 'GEN', 'MP', 'MER')),
  classification_tier smallint check (classification_tier between 1 and 5),
  created_at timestamptz not null default now()
);
create index sales_store_data_idx on public.sales(store_id, data_iso);
create index sales_store_matricula_idx on public.sales(store_id, matricula);
create index sales_store_grupo_idx on public.sales(store_id, grupo);

-- ============ CLASSIFICATION SOURCES ============
-- Tier 1 — exact catalog match by product code or name
create table public.catalog (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  nome text not null,
  codigo text,
  categoria text not null check (categoria in ('DERM', 'GEN', 'MP', 'MER')),
  created_at timestamptz not null default now()
);
create index catalog_store_idx on public.catalog(store_id);

-- Tier 2 — per-product keyword lists, grouped by category
create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  categoria text not null check (categoria in ('DERM', 'GEN', 'MP', 'MER')),
  nome text not null,
  padrao text,
  palavras text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index products_store_categoria_idx on public.products(store_id, categoria);

-- Tier 3 — brand keywords per category (GEN also requires a generic marker in the name)
create table public.brand_keywords (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  categoria text not null check (categoria in ('DERM', 'GEN', 'MP', 'MER')),
  palavra text not null,
  created_at timestamptz not null default now()
);
create index brand_keywords_store_categoria_idx on public.brand_keywords(store_id, categoria);

-- Exclusive-brand override list — always recategorizes a match to MP
create table public.exclusive_brands (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  palavra text not null,
  created_at timestamptz not null default now()
);
create index exclusive_brands_store_idx on public.exclusive_brands(store_id);

-- ============ GOALS ============
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  categoria text not null check (categoria in ('DERM', 'GEN', 'MP', 'MER')),
  mensal numeric not null default 0,
  diaria numeric not null default 0,
  metrica text not null default 'valor' check (metrica in ('valor', 'unidade')),
  auto_redistribuir boolean not null default false,
  super_meta numeric not null default 0,
  super_meta_auto boolean not null default false,
  unique (store_id, categoria)
);

create table public.individual_goals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  categoria text not null check (categoria in ('DERM', 'GEN', 'MP', 'MER')),
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  valor_meta numeric not null default 0,
  valor_super numeric not null default 0,
  participa boolean not null default false,
  unique (store_id, categoria, collaborator_id)
);

-- ============ DYNAMICS (Dinâmicas Comerciais) ============
create table public.dynamics (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  titulo text not null,
  descricao text not null default '',
  data_inicio date not null,
  data_fim date not null,
  meta_valor numeric not null default 0,
  metrica text not null default 'valor' check (metrica in ('valor', 'unidade')),
  produtos text[] not null default '{}',
  participantes text[] not null default '{}', -- matriculas; empty = everyone
  created_at timestamptz not null default now()
);
create index dynamics_store_idx on public.dynamics(store_id, data_fim);

-- ============ BIOSINTÉTICA ============
create table public.bio_groups (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  grupo text not null check (grupo in ('G1', 'G2', 'G3', 'G4')),
  nome text not null,
  palavras text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index bio_groups_store_grupo_idx on public.bio_groups(store_id, grupo);

-- ============ SPECIAL LISTS (Levmel / Chip) ============
create table public.special_lists (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  tipo text not null check (tipo in ('levmel', 'chip')),
  nome text not null,
  palavras text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index special_lists_store_tipo_idx on public.special_lists(store_id, tipo);

-- ============ STORE SETTINGS (appearance, hours, BIO weights) ============
create table public.store_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  meta_geral_fallback numeric not null default 43000,
  cor_destaque text not null default '#00f0ff',
  brilho int not null default 100,
  tema text not null default 'ciano',
  modelo_ranking text not null default 'escadinha' check (modelo_ranking in ('escadinha', 'capsula')),
  horario jsonb not null default '{
    "dom": {"ativo": false, "abre": "08:00", "fecha": "18:00"},
    "seg": {"ativo": true, "abre": "08:00", "fecha": "18:00"},
    "ter": {"ativo": true, "abre": "08:00", "fecha": "18:00"},
    "qua": {"ativo": true, "abre": "08:00", "fecha": "18:00"},
    "qui": {"ativo": true, "abre": "08:00", "fecha": "18:00"},
    "sex": {"ativo": true, "abre": "08:00", "fecha": "18:00"},
    "sab": {"ativo": true, "abre": "08:00", "fecha": "18:00"},
    "feriado": {"abre": "08:00", "fecha": "14:00"}
  }'::jsonb,
  feriados_datas date[] not null default '{}',
  bio_weights jsonb not null default '{"G1": 1.5, "G2": 1.0, "G3": 0.5, "G4": 0.5}'::jsonb
);

-- ============ HELPER FUNCTIONS (security definer to dodge RLS recursion on profiles) ============
create or replace function public.current_store_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select store_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_collaborator_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select collaborator_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_collaborator_matricula()
returns text
language sql stable security definer set search_path = public as $$
  select c.matricula from public.profiles p
  join public.collaborators c on c.id = p.collaborator_id
  where p.id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false)
$$;

-- ============ ADM BOOTSTRAP TRIGGER ============
-- Binds a newly-signed-up auth user to the 'admin' role when their email
-- matches a store's designated admin_email. This is the only way a profile
-- gets role='admin' — there is no self-service admin signup beyond this.
create or replace function public.handle_new_admin_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_store_id uuid;
begin
  select id into v_store_id from public.stores where admin_email = new.email;
  if v_store_id is not null then
    insert into public.profiles (id, store_id, role)
    values (new.id, v_store_id, 'admin')
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_bind_admin
  after insert on auth.users
  for each row execute function public.handle_new_admin_user();

-- ============ ROW LEVEL SECURITY ============
alter table public.stores enable row level security;
alter table public.collaborators enable row level security;
alter table public.profiles enable row level security;
alter table public.sales enable row level security;
alter table public.catalog enable row level security;
alter table public.products enable row level security;
alter table public.brand_keywords enable row level security;
alter table public.exclusive_brands enable row level security;
alter table public.goals enable row level security;
alter table public.individual_goals enable row level security;
alter table public.dynamics enable row level security;
alter table public.bio_groups enable row level security;
alter table public.special_lists enable row level security;
alter table public.store_settings enable row level security;

-- stores: both roles can read their own store; only admin can update it.
create policy stores_select on public.stores for select
  using (id = public.current_store_id());
create policy stores_update_admin on public.stores for update
  using (id = public.current_store_id() and public.is_admin());

-- profiles: a user can always see their own row; admins can see every profile in their store.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or (public.is_admin() and store_id = public.current_store_id()));

-- collaborators: admin has full CRUD scoped to their store; a collaborator can only read their own row.
create policy collaborators_select_admin on public.collaborators for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy collaborators_select_self on public.collaborators for select
  using (id = public.current_collaborator_id());
create policy collaborators_write_admin on public.collaborators for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy collaborators_update_admin on public.collaborators for update
  using (public.is_admin() and store_id = public.current_store_id());
create policy collaborators_delete_admin on public.collaborators for delete
  using (public.is_admin() and store_id = public.current_store_id());

-- sales: admin sees/manages every row in the store; a collaborator only reads rows tied to their own matricula.
create policy sales_select_admin on public.sales for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy sales_select_self on public.sales for select
  using (store_id = public.current_store_id() and matricula = public.current_collaborator_matricula());
create policy sales_write_admin on public.sales for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy sales_update_admin on public.sales for update
  using (public.is_admin() and store_id = public.current_store_id());
create policy sales_delete_admin on public.sales for delete
  using (public.is_admin() and store_id = public.current_store_id());

-- Reference/config tables shared by both roles: admin manages them, everyone
-- signed into the store can read them (needed to render goal progress, category
-- labels, dynamics, branding and business hours on both the ADM and collaborator UIs).
do $$
declare
  t text;
begin
  foreach t in array array['catalog', 'products', 'brand_keywords', 'exclusive_brands', 'goals', 'dynamics', 'bio_groups', 'special_lists', 'store_settings']
  loop
    execute format('create policy %I_select on public.%I for select using (store_id = public.current_store_id())', t, t);
    execute format('create policy %I_insert_admin on public.%I for insert with check (public.is_admin() and store_id = public.current_store_id())', t, t);
    execute format('create policy %I_update_admin on public.%I for update using (public.is_admin() and store_id = public.current_store_id())', t, t);
    execute format('create policy %I_delete_admin on public.%I for delete using (public.is_admin() and store_id = public.current_store_id())', t, t);
  end loop;
end $$;

-- individual_goals: admin manages everything; a collaborator can only read their own row.
create policy individual_goals_select_admin on public.individual_goals for select
  using (public.is_admin() and store_id = public.current_store_id());
create policy individual_goals_select_self on public.individual_goals for select
  using (collaborator_id = public.current_collaborator_id());
create policy individual_goals_insert_admin on public.individual_goals for insert
  with check (public.is_admin() and store_id = public.current_store_id());
create policy individual_goals_update_admin on public.individual_goals for update
  using (public.is_admin() and store_id = public.current_store_id());
create policy individual_goals_delete_admin on public.individual_goals for delete
  using (public.is_admin() and store_id = public.current_store_id());
