# Runbooks

Operational procedures for the people who run Twins OS. Companion to [ARCHITECTURE.md](ARCHITECTURE.md) and [INTEGRATIONS.md](INTEGRATIONS.md).

Commands here come from the repo's scripts, workflows, and notes. Things that depend on accounts or settings not recorded in the repository are marked **confirm**. Test every procedure once in TEST before you need it in an emergency.

## Contents

1. Environments and which one you are touching
2. Local development
3. Shipping a change
4. Database migrations (apply, drift, collisions, rollback)
5. Deploy, build, and cron problems
6. Incident playbooks
7. Routine operations

---

## 1. Environments and which one you are touching

| Environment | Supabase project | Used for |
|---|---|---|
| PROD | ref `mhphatxiqxbscivffejl` (from the drift workflow) | real customers, including the real Twins Lawn Service org |
| TEST | ref **confirm** (not recorded in the repo) | local development (`npm run dev:test`), experiments |
| Sandbox org | lives **inside PROD** | demos and role-play testing; a separate org from the real one |

**Before any `supabase` command that writes, check the linked project.** The CLI link has flipped between PROD and TEST before.

```bash
cat supabase/.temp/project-ref
```

Compare it to the table above. If it is not the project you intend, relink before continuing (`npx supabase link --project-ref <ref>`).

`npx supabase db query --linked` runs as a privileged role and **bypasses RLS**. Treat it as production access when linked to PROD.

## 2. Local development

```bash
npm install
cp .env.local.example .env.local
# Create .env.local.test with TEST project values (ask the owner); it is not in git.
npm run dev:test
```

- Always `dev:test`, not `dev`, so you never touch PROD data.
- **Two dev servers from the same checkout fight over one `.next` directory**, causing flaky 404/500 or "chrome-error" pages. Check the server log for `ENOENT` first; the cure is to stop both and start one. One working tree per task is the safest habit.
- Hydration warnings about radix ids in dev are the Next dev Segment Explorer, already disabled in `next.config.ts`; not an app bug.
- List pages may show a hydration mismatch in dev only (production bails out to client rendering).
- Verification before a PR: `npm run typecheck && npm run lint`, then exercise the change in the browser. There is no test runner yet.

## 3. Shipping a change

1. Branch from `main`, make the change, run `npm run typecheck` and `npm run lint` from the **committed** state (CI runs the same).
2. If the change adds a migration, follow section 4 first; the migration must reach TEST and PROD, and the code must tolerate the schema being applied before or after deploy as noted in the PR.
3. Open one PR per unit of work (each push to a non-ignored branch costs a Vercel build).
4. CI: typecheck + lint on every PR; the migration-drift check runs when `supabase/migrations/**` changes.
5. Merge to `main`; Vercel deploys production. Merge-time order for schema-dependent changes: apply the additive migration to PROD **before** merging code that needs it; apply destructive migrations (drop column, tighten constraint) **after** the code that stops using them is live.
6. After deploy, load the app, run the affected flow once, and check the Vercel runtime logs and Sentry.

## 4. Database migrations

### 4.1 Rules

- The repo's `supabase/migrations/` is the source of truth. Do not change PROD schema by hand without writing the matching migration file in the same sitting.
- **Apply every migration to both PROD and TEST.** They have drifted in both directions before; TEST was once 11+ days behind and missing whole tables and RPCs.
- File name: `YYYYMMDDHHMMSS_description.sql` with a **unique** timestamp. Concurrent sessions have produced colliding versions; look at the latest file in `main` before choosing one.
- Every new table: `org_id`, timestamps, `deleted_at`, RLS enabled with policies. Every new `SECURITY DEFINER` function: pinned `search_path`, org guard (`_org_mismatch()`, not `<>`), and `REVOKE EXECUTE ... FROM anon` unless it is a public endpoint.
- **When you `CREATE OR REPLACE` / drop-and-recreate a function or a CHECK constraint, restate everything the previous version enforced.** Two real incidents: a later `drop/create` silently removed an in-DB permission check, and a later migration re-did a CHECK constraint from a stale list and dropped values another migration had added. Inspect the *live* definition on PROD before writing the replacement.
- Changing a view's columns needs `DROP VIEW IF EXISTS` first.
- Do not set a column `DEFAULT` that a `BEFORE INSERT` trigger was meant to compute: the default is evaluated first, so the trigger sees a non-null value and skips (this broke per-org timezone dates once).
- Use `numeric` for fractional quantities; money is integer cents (round fractional cents before passing to integer-typed RPC params).
- After applying: `npx supabase gen types --linked > src/types/supabase.ts` (or `--local`), and commit it.

### 4.2 Apply a migration

```bash
cat supabase/.temp/project-ref          # confirm which project you are linked to
npx supabase db push                    # applies pending migrations to the linked project
```

Repeat for the other project after relinking. Then verify (section 4.3).

### 4.3 Check that PROD, TEST, and the repo agree

- **CI**: `.github/workflows/migration-drift-check.yml` compares repo versions to PROD's `supabase_migrations.schema_migrations` and fails on drift not listed in `supabase/.ci/migration-drift-baseline.json`. It needs the `SUPABASE_DB_URL` repo secret (use the **pooler** host on port 6543 with user `postgres.<ref>`; the direct host is IPv6-only and unreachable from GitHub runners). Never add a version to the baseline just to silence a check on your own migration.
- **By hand**: compare `ls supabase/migrations` to the `schema_migrations` table of each project, and compare table/column/constraint lists for schema drift (a migration can be recorded but its change missing).

### 4.4 Drift or version-mismatch recovery

Symptoms: the drift check fails, `db push` wants to re-apply something already applied, or a migration is recorded under a different version than its filename.

1. Establish what is **actually** in the live schema, not just in the ledger.
2. If the schema change is present and only the ledger version is wrong: re-stamp the ledger row to the filename's version (ledger-only change, no schema change). This was done in bulk (~321 rows) on 2026-09-20.
3. If the change is missing: apply it (idempotent SQL, `if not exists`).
4. **Two sibling PRs whose migrations are already on PROD can deadlock each other's drift check.** Merge one, re-stamp or rebase the other.
5. Merge `main` into the branch after re-stamping so file versions match.
6. Never drop a column before the code that reads it has merged.

### 4.5 Rolling back a bad migration

There are no down-migrations. Pick the least destructive option:

1. **Forward-fix** with a new migration (preferred). Write it, apply to TEST, then PROD.
2. If data was damaged, restore from a Supabase backup or point-in-time recovery (**confirm** the plan tier and PITR window in the dashboard; this determines how far back you can go). Prefer restoring *into a scratch project* and copying rows back over restoring the live project.
3. Never disable RLS to "get around" a failed policy; fix the policy.

### 4.6 Environment parity notes

- A snapshot-table pattern was used for destructive PROD data fixes (copy affected rows to a snapshot table first). Do that.
- The approval-email trigger depends on two database settings per project (see INTEGRATIONS.md).

## 5. Deploy, build, and cron problems

### Build hangs for ~45 minutes or dies with SIGKILL
Out-of-memory on the Standard build machine. In Vercel project settings, "Build machine configuration" must be **Enhanced**. Check this first.

### Build fails naming a random page, mentioning fonts
Duplicate `next/font/google` call sites fetch concurrently and get throttled. Keep it to two call sites.

### Build fails on `main`
Run `npm run typecheck` on a clean checkout of the failing commit. A recent real cause: a module stopped exporting a function another file imported (fixed in PR #345).

### A cron did not run or ran twice
1. Vercel -> project -> Cron Jobs: confirm the path is listed and see the last run status.
2. Vercel runtime logs for that path. Cron sends a GET to the production URL with `Authorization: Bearer $CRON_SECRET`; a 401 means `CRON_SECRET` is missing or changed in Vercel.
3. Cron is UTC. Daily jobs flip a calendar day at 8 pm US Eastern (EDT) / 7 pm (EST) in UTC terms; per-org logic uses the org's timezone.
4. Handlers should be idempotent; re-running by hand (curl with the bearer) is safe for most, but read the handler first for jobs that send email/SMS or create invoices (`contract-invoices`, `recurring-visits`, `scheduled-campaigns`).

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<production-domain>/api/cron/<job>
```

### Health check
`GET /api/health` returns `{"status":"ok"}` and 503 if the database is unreachable. Point an uptime monitor at it (**confirm** whether one exists).

## 6. Incident playbooks

### Approval emails stopped arriving
Check, in order: Postgres settings `app.edge_function_base_url` and `app.service_role_key` exist on that project (the trigger silently skips when absent); the edge function is deployed (`npx supabase functions deploy send-approval-email`); the function's `RESEND_API_KEY` secret is valid (it is **separate** from Vercel's); Resend sender domain verified.

### Emails send from the app but delivery/bounce/complaint tracking is empty
The Resend dashboard webhook must point to `/api/webhooks/resend` and subscribe to the events including `email.complained`; `RESEND_WEBHOOK_SECRET` must match its signing secret.

### Texts send but replies and delivery statuses never appear
Messaging Service inbound URL not set in Twilio Console (must be `<site>/api/webhooks/twilio/inbound`), or `X-Twilio-Signature` verification failing because the request URL Twilio signed differs from the URL the app computes (proxy/domain change). Check the route logs for signature failures.

### A card charge succeeded in Stripe but is missing on the invoice
Webhooks are the only writer of payment results. In Stripe -> Developers -> Webhooks, look for failed deliveries to `/api/crm/payments/connect-webhook` or `/api/billing/webhook`, fix the cause (secret mismatch, 5xx), and **resend the event**. Do not hand-insert a payment before checking allocations sum to `amount_paid`.

### Refund or credit left an invoice inconsistent
Allocations must sum to `amount_paid`. A refund that breaks this makes the next charge debit the card and then fail to record. Fix allocations first, then investigate. Preserve evidence with a snapshot table before editing rows.

### A user sees another org's data, or cannot see their own
Treat any cross-tenant sighting as a security incident: capture the user, org, and URL; check whether the user has a `profiles` row (NULL `my_org_id()` cases), whether a staff impersonation session is active, and the policies on the affected table. If confirmed, restrict the affected route/table first, then fix, then review recent migrations for a `drop/create` that lost a guard.

### A customer's portal user lands in the staff app, or staff are bounced to the portal
Middleware decides by `profiles` row existence. Portal users must have none; staff must have one. Check the row.

### Crew cannot log in, clock in, or upload photos
Crew login is per crew (`crm_crews.user_id`). Photo uploads fail when storage RLS omits the `crew` role. Clock actions require the caller to resolve to the visit's effective crew (visit crew, else the job's crew).

### Staff impersonation: "End your impersonation session"
Routes that write via the service role into the caller's home org refuse while an active impersonation grant exists (HTTP 409). End the session in the UI.

### QuickBooks sync stuck or erroring
Settings -> Integrations shows status; `/api/cron/quickbooks-sync` runs every 15 min. Common causes: expired refresh token (reconnect), `QUICKBOOKS_ENVIRONMENT` not matching the ID/secret pair, an invoice voided or edited in QuickBooks. This integration is new; expect gaps.

### Suspected leaked secret
Follow the rotation checklist in INTEGRATIONS.md. For a Resend key, first identify which consumer (Vercel or edge function) the leaked prefix belongs to.

## 7. Routine operations

| When | Task |
|---|---|
| each schema change | apply to PROD and TEST, regenerate `supabase.ts`, commit it |
| weekly | review Dependabot PRs; `npm audit` output in CI |
| monthly | review Supabase security advisor (expected baseline on PROD: 0 errors, ~47 warnings, all deliberate; 8 deny-all tables must **not** get policies) |
| monthly | confirm a recent Supabase backup exists and test a restore into a scratch project |
| before each release | `npm run typecheck && npm run lint`, run the affected flow in TEST |
| when adding an org | confirm timezone, Stripe Connect status, Twilio provisioning state; new orgs start on the `free` plan and `trial_ends_at` must not be back-filled |
| when onboarding a new teammate | grant GitHub, Vercel, Supabase (PROD+TEST), Stripe, Resend, Twilio, Intuit, Google Cloud, Sentry access; update the owner column in INTEGRATIONS.md |

### Safe ways to look at production data
- Prefer read-only queries; remember `db query --linked` bypasses RLS.
- For anything that writes, wrap it in a transaction you can roll back, snapshot affected rows first, and record what you did in the PR or a note in this repo.
- Demo and testing belong in the **sandbox org**, never the real Twins Lawn Service org.
