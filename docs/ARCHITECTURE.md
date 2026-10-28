# Architecture

How Twins OS fits together. Read [CLAUDE.md](../CLAUDE.md) first for the domain model and conventions; this document covers the runtime: how a request flows, how tenancy and permissions are enforced, and where background work and third parties plug in.

Written 2026-10-27 from the code at `main`. Where something could not be verified from the repository, it says so.

## 1. System overview

```
Browser (staff app, client portal, public pages)      Crew app (Expo, scaffolding)
        |  cookie session                                    |  Bearer access token
        v                                                    v
+--------------------------- Next.js on Vercel ---------------------------+
|  middleware.ts -> updateSession()   (refreshes the Supabase session)    |
|  Pages / layouts (App Router, Server Components by default)             |
|  Route Handlers  src/app/api/**     (253 handlers, each does own auth)  |
|  Vercel Cron  ->  /api/cron/**  and a few /api/crm/**, /api/automations |
+-----------+------------------------------------------+------------------+
            | user-scoped client (RLS applies)         | service-role client (bypasses RLS)
            v                                          v
+---------------------------------- Supabase ----------------------------------+
|  Postgres: tables + RLS, views (rpt_*), RPCs, triggers                         |
|  Auth, Storage, Realtime, Edge Function send-approval-email (pg_net trigger)   |
+--------------------------------------------------------------------------------+
            ^
            | webhooks in: Stripe (3 endpoints), Twilio (status, inbound), Resend, Zapier hooks
            | calls out:   Stripe, QuickBooks Online, Twilio, Resend, Google Maps, Anthropic, Samsara, Sentry
```

Two products share this runtime: **Equipt** (CMMS + purchase orders) and **Landscapt** (CRM / field service). They share one database, one auth system, and a few tables (vendors above all).

## 2. Repository map

| Path | Contents |
|---|---|
| `src/app/(auth)` | login, signup, password reset, `/confirm` token handler |
| `src/app/(dashboard)` | Equipt: `cmms`, `po`, `equipt`, `vendors`, `operations`, `docs`, `support` |
| `src/app/(crm)` | Landscapt staff app (`/crm/...`) |
| `src/app/(home)`, `(photos)`, `(reports)`, `(settings)`, `(tools)` | Home, job photos, `/dashboards`, settings, tools |
| `src/app/portal`, `proposal`, `invoice`, `forms`, `request` | customer-facing and public pages (no staff login) |
| `src/app/api/**` | Route Handlers. Groups: `crm/`, `cron/`, `portal/`, `public/`, `v1/` (public REST API), `mcp/` (OAuth + MCP server), `integrations/`, `webhooks/`, `billing/`, `field/`, `settings/`, `users/`, `orgs/` |
| `src/lib/supabase/` | `server.ts` (`createClient` user-scoped, `createServiceClient`), `middleware.ts`, `route-auth.ts`, `crew-id.ts` |
| `src/lib/hooks/` | TanStack Query hooks. **Most client-side data access and a lot of business logic live here** (largest: `use-crm-jobs.ts`, `use-invoices.ts`, `use-clients.ts`) |
| `src/lib/<domain>/` | Pure-ish domain logic: `estimates`, `invoices`, `crew`, `automations`, `stripe`, `reports`, `pricing`, `payroll`, `notifications`, `sms`, `email`, `integrations`, `portal`, `time` |
| `src/types/` | Types and Zod schemas per domain; `supabase.ts` is **generated** |
| `src/stores/` | Zustand stores (UI state, current user, per-module state, chat) |
| `supabase/migrations/` | 737 SQL migrations (the schema's source of truth) |
| `supabase/functions/` | one Edge Function: `send-approval-email` |
| `supabase/.ci/migration-drift-baseline.json` | accepted historical drift between repo and PROD |
| `crew-app/` | Expo crew app, still scaffolding |
| `scripts/` | one-off imports/backfills and build helpers |

## 3. Request lifecycle

1. **Middleware** (`src/middleware.ts` -> `lib/supabase/middleware.ts`) runs on every non-static path. It refreshes the Supabase session cookie, then:
   - redirects signed-out users on non-public paths to `/login?redirectTo=...`;
   - treats `/api/*` as public at this layer ("all API routes handle their own auth");
   - for staff areas (`/crm`, `/settings`, `/dashboards`, `/cmms`, `/po`, ...) checks that a `profiles` row exists. **Client-portal users have no `profiles` row**, so this is what bounces a customer who opens the staff app to `/portal`.
2. **Page / layout** (Server Component by default) or a **client component** that calls a TanStack Query hook, which talks to Supabase directly with the browser client under the user's session (RLS enforces tenancy) or calls a Route Handler with `fetch`.
3. **Route Handler** authenticates itself. Common patterns, by frequency in the code:
   - `getRouteAuth(request)` (`lib/supabase/route-auth.ts`): accepts the cookie session **or** an `Authorization: Bearer` token (crew app) and returns a user-scoped client plus the user;
   - `authenticateApiRequest` / `adminClient` (`lib/api/auth.ts`): public REST API and MCP, using hashed API keys (`tos_...`) or short-lived OAuth tokens, with scopes and per-minute rate limits;
   - `getPortalContext()` for customer-portal routes;
   - permission helpers (`hasAnySettingsPermission`, `rejectWithoutFormsPermission`, `authorizePricing`, `rejectIfImpersonating`);
   - `CRON_SECRET` bearer check for cron endpoints;
   - signature verification for webhooks (Stripe, Twilio HMAC-SHA1, Resend via svix);
   - a handful of intentionally unauthenticated endpoints (`health`, `openapi`, `billing/plans`, `public/forms/[slug]`, login).
4. **Database access.** Two clients exist, and the difference matters:
   - `createClient()` / browser client: runs as the user, **RLS applies**.
   - `createServiceClient()` / `adminClient()`: service role, **RLS is bypassed**. About 110 source files use it. Every such code path must itself verify the caller's org and permission, and take `org_id` from the session, never from the request.

## 4. Multi-tenancy

- Every row carries `org_id`. Policies key on the SQL helper `my_org_id()` (resolves the caller's org from `profiles`).
- **Staff impersonation:** platform staff (the Landscapt org itself, `is_staff()` / `is_platform_staff_org`) can view a customer org via `staff_impersonation_sessions`; `my_org_id()` honors an active grant. Service-role routes that would write into the staff member's *home* org must call `rejectIfImpersonating` (`lib/auth/impersonation-guard.ts`).
- **NULL-org trap:** a user with no `profiles` row (portal users, mid-signup) gets a NULL `my_org_id()`. Guards written as `org_id <> my_org_id()` pass on NULL. Use the `_org_mismatch()` helper instead (see migration `20260928100000_null_org_guards_and_member_write_policies.sql`).
- Canceled orgs are excluded from automated work via `createOrgCanceledResolver` (`lib/orgs/org-canceled.ts`).
- Per-org timezone lives in `organizations.timezone`; day boundaries use the org's zone (`lib/time/`), not UTC.

## 5. Identity and permissions: three overlapping models

| Model | Applies to | Where defined / enforced |
|---|---|---|
| `crm_roles` permission keys | **Landscapt** (CRM, dashboards, settings tabs, estimates, contracts, ...) | Role rows per org (`crm_roles`, seeded by migration), key catalog in `src/types/crm-roles.ts`; UI gating via `lib/permissions/settings-access.ts` and friends; DB gating via `has_crm_access()` (inline on some tables, a RESTRICTIVE policy on ~66 more) |
| Fixed role set `admin / manager / technician / purchaser / viewer` (+ requestor) | **Equipt** (29 tables) | RLS on Equipt tables; "limited roles" do not constrain Landscapt |
| Internal-org guard | Twins-only dashboards (AvB, Financial, Safety, legacy KPI/CRM report) | Hard-coded org check, deliberately not in `crm_roles` |

Other identities: **crew logins** are per crew (not per person) and map to `crm_crews.user_id`; **client-portal users** are Supabase users with no `profiles` row; **API/MCP callers** are keys or OAuth tokens scoped to an org.

## 6. Background work

All schedules are in `vercel.json` (UTC). 23 entries:

| Cadence | Jobs |
|---|---|
| every minute | `support-chat-notify` |
| every 15 min | `/api/automations/run` (automation engine), `quickbooks-sync`, `sales-meeting-reminders`, sales-meeting automation date triggers |
| hourly | `scheduled-campaigns`, `report-schedules` |
| daily (05:00-13:00 UTC) | `sync-seat-overage`, `bill-sms-overage`, `recurring-visits`, `contract-invoices`, `invoice-past-due`, `ticket-past-due`, `card-expiry-notify`, estimate expiry + automation date triggers, contract/warranty expiry, `low-stock`, `pm-due`, `work-order-overdue`, `twilio-status-check`, Samsara sync |

Cron handlers authenticate with `Authorization: Bearer $CRON_SECRET`. Vercel Cron calls are plain HTTP GETs to the production URL and are not retried by default, so handlers must be idempotent and safe to re-run.

Database-originated work: a Postgres trigger (`fn_notify_approval_email`) calls the `send-approval-email` Edge Function through `pg_net`; it needs `app.edge_function_base_url` and `app.service_role_key` database settings (see [supabase/DEPLOYMENT.md](../supabase/DEPLOYMENT.md)) and silently skips if they are absent.

## 7. Key subsystems

- **Estimating / job costing** (`lib/estimate-calc.ts`, `lib/job-costing-calc.ts`, `lib/cost-methods.ts`): Aspire-style budget engine; per-service `budget_method` is explicit (`manual` or `production_rate`). Job-costing scenarios and burdened labor rates are per org.
- **Invoicing and payments** (`lib/invoices/`, `lib/stripe/`, `lib/contract-billing.ts`): money in integer cents; allocations must sum to `amount_paid`; credit is applied before charging a card; card payments are direct charges on each org's **Stripe Connect** account. Webhooks are the sole writer of payment results.
- **Contracts and packages** (`contract-billing.ts`, `package-schedule.ts`): `monthly_amount_cents` is per invoice at every billing frequency; contract-linked package jobs are billed inside the contract price.
- **Scheduling** (DispatchBoard, `lib/crew/`, `crm_crew_route_order`): a visit's `crew_id` is often null, always fall back to the job's crew (`effectiveVisitCrewId`). Stop address comes from one resolver (`resolveStopAddress`).
- **Crew app flows** (`/api/crm/crew/*`, `lib/crew/`): stops group same-property visits; hours = (out - in - breaks) x men; day shifts and payroll tab; punches vs visit hours are reconciled (`recomputeStopLabor`).
- **Automations** (`lib/automations/`, `/api/automations/run`): sequences with email/SMS/tag steps, conditions evaluated in `sequence-enrollment.ts`; SMS gated on `clients.sms_opt_in`. Known gaps are listed in `TASKS.md`.
- **Reporting** (`lib/reports/`, `rpt_*` views, `crm_run_report` RPC): about 70 reports and multi-tab dashboards. Reports query SQL views, and a past audit found views that bypassed RLS, so new views need `security_invoker` or an explicit org filter.
- **Audit trail**: one `fn_audit_log` trigger with child-to-parent rollup.
- **Notifications**: in-app (Supabase Realtime), email (Resend), SMS (Twilio), push (`lib/notifications/send-push.ts`). The actor is never notified of their own action.
- **Public API and MCP**: `/api/v1/*` REST over 14 resources with scoped API keys (an add-on, `API_ACCESS`); `/api/mcp` is an OAuth 2.1 + PKCE MCP server; OpenAPI at `/api/openapi`; Zapier at `/api/integrations/zapier/*` (see [zapier-integration.md](zapier-integration.md)).
- **In-app docs**: `docs-content.ts` and `docs-guides-content.json`, indexed by `scripts/build-docs-index.mjs` on every build (`prebuild`).

## 8. Environments and deployment

- **Two Supabase projects, PROD and TEST.** Local development (`npm run dev:test`) reads `.env.local.test` and uses TEST. There is also a sandbox org on PROD for demos. See [RUNBOOKS.md](RUNBOOKS.md).
- **Vercel** builds `main` to production; `claude/**` branches do not deploy (`vercel.json`), and an ignore script skips preview builds when nothing the build reads has changed.
- **Schema**: only migrations change it. A GitHub workflow compares the repo's migrations to PROD's `schema_migrations` and fails on drift beyond the committed baseline.
- **Observability**: Sentry (client, server, edge) when `NEXT_PUBLIC_SENTRY_DSN` is set; structured `logger` utility in `lib/logger.ts`.

## 9. Known structural risks

These are summarized from [HANDOFF_ASSESSMENT.md](HANDOFF_ASSESSMENT.md); read it for evidence and priorities.

- Business logic is split between SQL (RPCs/triggers), Route Handlers, and client hooks that write directly with the user's session. Some side effects (for example notifications after a visit update) depend on the client making a second call.
- 110 files use the service-role client; 410 `SECURITY DEFINER` functions each need a pinned `search_path` and an org check.
- No automated tests; CI runs typecheck and lint only.
- Reports run live over transactional tables; check indexes and RLS helper cost before onboarding large tenants.
- Equipt/Landscapt separation is by convention, not enforced by tooling.
