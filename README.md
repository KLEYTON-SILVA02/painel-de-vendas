# Painel de Gestão de Vendas

React + Supabase rebuild of the original single-file `index.html` (kept for reference under
[`legacy/index-original.html`](legacy/index-original.html) — it's the source of truth for every
business rule ported here).

## Stack

- Vite + React + TypeScript, Tailwind CSS
- Supabase (Postgres + Auth + Edge Functions) — multi-tenant schema, RLS on every table
- Deployed via Netlify (continuous deploy from this branch/repo)

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

## Scripts

- `npm run dev` — dev server
- `npm test` — Vitest unit tests for the business-logic layer (`src/lib/business/`)
- `npm run build` — typecheck + production build
- `npm run lint` — Oxlint

## Project layout

- `src/lib/business/` — pure, framework-free port of the legacy calculation rules
  (product classification, goal redistribution, dynamics date intersection, BIOSINTÉTICA
  scoring, import mapping). Every function here is unit-tested against values traced by hand
  from the legacy code.
- `src/auth/` — Supabase Auth integration: ADM login/signup (real e-mail, auto-bound to the
  `admin` role by a DB trigger matching `stores.admin_email`) and collaborator login
  (matrícula+senha, resolved to a synthetic e-mail via the `resolve_collaborator_email` RPC).
- `src/lib/supabase.ts`, `src/types/database.ts` — typed Supabase client.
- `supabase/migrations/` — the applied schema history (source of truth is the live project;
  regenerate `src/types/database.ts` after any schema change).
- `supabase/functions/create-collaborator/` — the only place collaborator logins are
  provisioned (needs the service-role key, so it can't run client-side).

## Access model

- **Admin**: a single fixed account per store (`stores.admin_email`), full access.
- **Collaborator**: matrícula+senha login, sees only their own sales/goals — enforced by RLS,
  not just UI hiding.
- Schema is multi-tenant (`store_id` on every table) but there is currently no self-service
  store creation flow — a new store's admin_email is seeded directly in the database.
