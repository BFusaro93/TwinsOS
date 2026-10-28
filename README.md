# Twins OS: Equipt + Landscapt

A multi-tenant SaaS platform with two products on one codebase:

- **Equipt**: CMMS (assets, work orders, PM schedules, parts) plus the Purchase Order / procurement backbone.
- **Landscapt**: field service management and CRM (clients, estimates, jobs, dispatch, invoicing, contracts, automations, reports), aimed at landscaping and snow operations.

Next.js (App Router, TypeScript strict) + Supabase (Postgres with Row Level Security, Auth, Storage), deployed on Vercel.

## Start here

| If you want to... | Read |
|---|---|
| Understand the domain model, conventions, and traps | [CLAUDE.md](CLAUDE.md) |
| See the state of the codebase for handoff (docs, debt, security, architecture) | [docs/HANDOFF_ASSESSMENT.md](docs/HANDOFF_ASSESSMENT.md) |
| Set up or promote a Supabase environment | [supabase/DEPLOYMENT.md](supabase/DEPLOYMENT.md) |
| Integrate with the public API / Zapier | [docs/zapier-integration.md](docs/zapier-integration.md) |
| See deferred work and known gaps | [TASKS.md](TASKS.md) |
| Look at the competitor UI references | [docs/reference/](docs/reference/) |

## Running locally

Prerequisites: Node 20+ and npm.

```bash
npm install
cp .env.local.example .env.local        # fill in values; every variable is documented inside
npm run dev:test                        # dev server on localhost:3000 against the TEST Supabase project
```

Use `dev:test` rather than `dev`. It loads `.env.local.test`, which points at the TEST project, so local work never touches production data. Ask the current owner for the TEST credentials.

## Commands

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # next lint
npm run build         # production build (prebuild regenerates the in-app docs index)
npm run docs:index    # rebuild the in-app docs search index
```

There is no automated test suite yet. CI runs typecheck and lint on every pull request; the migration-drift check runs when migrations change.

## Environments

Two Supabase projects: **PROD** and **TEST**. Every migration must be applied to both, and the drift check (`.github/workflows/migration-drift-check.yml`) compares the repo against PROD's migration history. After any schema change, regenerate types (`npx supabase gen types`) and commit `src/types/supabase.ts`.

## Repository layout

```
src/app/            Next.js routes: (dashboard)/po, cmms, crm, settings; api/ route handlers
src/components/     ui/ (shadcn, do not modify), shared/, and per-module components
src/lib/            hooks/, supabase/ clients, domain logic (estimates, invoices, crew, automations, reports...)
src/types/          shared types and Zod schemas; supabase.ts is generated
supabase/           migrations/, edge functions, deployment notes
scripts/            one-off import/backfill utilities and build helpers
crew-app/           native crew app (Expo), still scaffolding
docs/               guides and reference material
```

## Ground rules (short version)

- Every table has RLS. Never disable it to work around a problem; fix the policy.
- `org_id` always comes from the authenticated session, never from a request body.
- Money is integer cents. Deletes are soft (`deleted_at`).
- Clients (customers) and Vendors (suppliers) are separate tables.
- Equipt and Landscapt only interact at the integration points listed in `CLAUDE.md`.
