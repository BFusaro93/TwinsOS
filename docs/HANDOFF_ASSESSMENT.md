# Twins OS: Codebase Handoff Assessment

Date: 2026-10-27. Scope: the `main` branch as of commit `1c4a9bac`.
Method: static survey (file counts, greps, reading representative files). Nothing was run against the live databases, so every "verify" item below needs a live check by the incoming team.

Counts come from greps. Treat them as approximate, and treat a count as a prompt to look, not a verdict.

## Size at a glance

| Item | Count |
|---|---|
| TypeScript/TSX files in `src/` | ~1,515 (~338k lines, of which 18k is generated `supabase.ts`) |
| Pages / API route handlers | 196 / 253 |
| SQL migrations | 737 (~66k lines), 187 tables created |
| Cron jobs (`vercel.json`) | 23 paths, 18 handlers in `src/app/api/cron` |
| Commits | ~1,633 (almost all by one person) |
| Automated tests | **0** |
| CI workflows | 1 (migration drift check only) |

---

## 1. Is it documented?

**Verdict: product documentation is strong, engineering documentation is thin, and the most important gap is that there is no root README.**

What exists:
- `CLAUDE.md` and `AGENTS.md` carry the domain model, DB conventions, auth and multi-tenancy rules, and a "gotchas" list. This is the best onboarding document in the repo, but it is written as instructions to an AI agent, and parts of it are stale (see section 3).
- `supabase/DEPLOYMENT.md` covers first-time environment setup (migrations, edge function, secrets, Postgres settings).
- `scripts/build-data-dictionary.mjs` generates `src/lib/data-dictionary.json`, and there is an OpenAPI route plus an in-app docs system (`docs-content.ts`, `docs-guides-content.json`) aimed at end users. These are good.
- Many migrations and route files carry long, explanatory header comments (why a decision was made, what bug it fixed). This is unusually valuable context.
- `.env.local.example` (128 lines) documents environment variables.
- `TASKS.md` records deferred work with reasoning.

What is missing:
- **No root `README.md`.** A new engineer's first five minutes have no entry point.
- **No architecture map.** Nothing describes how the pieces fit: request flow (middleware → route handler → service-role vs RLS client), the permission model (`crm_roles` vs the Equipt role set vs the Twins-only internal guard), how impersonation works, how crons and webhooks relate, what Stripe/QuickBooks/Twilio/Resend/Zapier/MCP each own.
- **No runbooks.** Rotating each third-party key, restoring from a bad migration, the PROD/TEST migration-drift recipe, what to do when a cron fails. Much of this lives only in the author's assistant memory notes, which are not part of the repo and will not transfer.
- **No dependency/integration inventory** (which external accounts exist, who owns each login, which webhooks must be configured in third-party dashboards).
- **Tribal knowledge is the biggest risk.** Examples: the "two Resend keys" problem, PROD vs TEST project refs, sandbox org identities, "never test with a Googlebot UA", the `app.change_order_rpc` GUC. These are known only to the author and the assistant.
- `CLAUDE.md` says to run `npm run test` and `npm run test:e2e`; neither script exists.

**Fix first:** write `README.md`, `docs/ARCHITECTURE.md`, `docs/RUNBOOKS.md`, `docs/INTEGRATIONS.md` (see the checklist at the end).

---

## 2. Technical debt

### Highest priority

1. **No automated tests, and CI does not typecheck, lint, or build.** The only workflow checks migration drift. Quality has been maintained by the author's manual review and browser verification. A new team has no safety net for refactors. The money paths (invoice math, tax, refunds and payment allocations, contract billing, change orders, commissions, QuickBooks sync) are the most urgent places for tests.
2. **Migration management.** 737 migrations and 66k lines of SQL, with documented history of colliding versions, ledger re-stamping between PROD and TEST, DROP/ADD CHECK constraints silently reverting each other, and "stale landmine" migrations. The drift-check workflow is a good mitigation, but the history is not reproducible from scratch without care. **Verify:** `supabase db reset` against an empty database succeeds end to end. If it does not, a new team cannot stand up a fresh environment.
3. **Type safety is weaker than the standards claim.** `CLAUDE.md` says "no `any`". There are ~1,670 uses of `any`, ~1,750 `eslint-disable-next-line ...no-explicit-any` comments (the lint rule is being suppressed rather than followed), and 57 `exhaustive-deps` suppressions. Most are `(supabase as any)` casts, which usually means the generated types are out of date for those tables or the casts were used to get past the compiler. Regenerating `supabase.ts` and removing the casts would restore real type checking on the data layer.
4. **Very large files.** `DispatchBoard.tsx` (5.8k lines), `ClientDetailPanel.tsx` (4.4k), `use-crm-jobs.ts` (3.4k), `LandscaptSettingsTabs.tsx` (2.6k), `use-invoices.ts` (2.5k), `JobDetail.tsx` (2.5k). These are hard to review and risky to change. The `DispatchBoard` has a known duplicate (`JobDetailSheet` exists in two places and fixes do not propagate).

### Medium priority

5. **Standards drift versus `CLAUDE.md`.**
   - "No raw `fetch` in components": ~79 component/hook files call `fetch(` directly.
   - "No `console.log`": 89 `console.*` calls remain in `src/` despite the structured `logger`.
   - "Soft deletes only": ~39 `.delete()` calls exist in `src/`. Some are legitimately join-table or ephemeral rows, but each should be reviewed against the policy.
   - "Zod at the API boundary": only ~63 of 253 route handlers import zod.
6. **Business logic in components and hooks.** The largest hooks and panels hold pricing, billing, and scheduling logic. Moving it to `lib/` pure functions (several already exist, e.g. `estimate-calc.ts`, `job-costing-calc.ts`) makes it testable.
7. **Silent failure patterns.** ~340 `catch {` / `.catch(() => {})` sites swallow errors. Some are intentional best-effort calls (notifications), but several historical bugs in `TASKS.md` and the migration history were caused by silent insert failures that no one saw for weeks. Sentry is configured; check that these sites report to it.
8. **Repo hygiene.** Root contains `test.txt`, seven competitor screenshots (Fleetio, MaintainX), and `UI Outline.docx` committed to git. Move them to a `docs/reference/` folder or remove them. `src/modules/photo-docs/` is a lone `modules/` directory that departs from the layout in `CLAUDE.md`. The `crew-app/` Expo project is described as "still scaffolding", so decide whether it ships or is archived.
9. **Documented deferred items** in `TASKS.md` (e.g. `if_branch` automation events that appear in the builder but cannot run, `custom_field` conditions that never match) are features that look live in the UI but are not. These should either be hidden in the UI or finished.

### Lower priority

- ~1,515 files with one dominant contributor means consistent style but a bus factor of one.
- Deprecated-pattern checks: confirm Next.js and dependency versions are current before handover (`npm outdated`, `npm audit`).
- Build is memory-hungry (Vercel needs the Enhanced build machine) and sensitive to `next/font/google` call-site count. Document both.

---

## 3. Security and error handling

Overall the posture is better than typical for a fast-built SaaS, and visible effort has gone into it: RLS is enabled on essentially every table, `org_id` comes from the session, there is a documented security-advisor baseline (0 ERROR / 47 WARN, each deliberate), rate limiting on auth routes, Twilio and Resend signature verification, OAuth token hashing, and several rounds of cross-tenant sweeps. The items below are what a handoff reviewer should still check.

**Strengths found**
- RLS: 186 `enable row level security` statements for 187 created tables. The eight tables my grep flagged as missing it (`crm_warranties`, `crm_commission_*`, `crm_price_adjustments`) do enable RLS, through a dynamic `format()` loop or differently formatted statements. That was a false positive from the search, not a gap.
- Webhooks verify signatures (Twilio HMAC, Resend via svix, Stripe).
- Route handlers share guards (`getRouteAuth`, `authenticateApiRequest`, `getPortalContext`, permission helpers, impersonation guard).
- Only `.env.local.example` is tracked; no live-looking keys were found in `src`, `scripts`, or `supabase`.

**Things to verify or fix**
1. **Service-role usage is wide.** 110 source files use the service client or `adminClient`, which bypasses RLS. Every such route must do its own org and permission check. This is the single most valuable audit target. A past sweep found a NULL `my_org_id()` that passed 18 RPC guards, so this class of bug has already occurred here.
2. **410 `SECURITY DEFINER` function definitions.** Each needs a pinned `search_path` and an explicit org check (`_org_mismatch()`), and anonymous execute must be revoked. A prior incident exposed 63 such functions to anonymous callers. Add a CI check that fails on new `SECURITY DEFINER` functions without those properties.
3. **Unauthenticated routes, by design or not.** My scan found these without a recognizable guard: `crm-report`, `health`, `openapi`, `webhooks/resend` (signature-verified inside), `billing/plans`, `public/forms/[slug]`, `auth/login`. All plausibly intentional. `crm-report` serves stored HTML and depends entirely on RLS for `crm_reports`; confirm that policy. This scan is heuristic, so a human should read the full route list.
4. **`dangerouslySetInnerHTML` in 11 files.** Job notes are stored as HTML (with a sanitizer). Confirm every one of the 11 sites sanitizes input, and that sanitizer rules match between client and server.
5. **Secrets handling.** Edge function and Postgres settings (`app.service_role_key`) hold the service key by documented design. Make sure rotation is written down. Two separate Resend keys (Vercel and the edge function) is an easy-to-miss trap.
6. **No dependency or secret scanning in CI** (no Dependabot, `npm audit`, or secret-scan workflow).
7. **Tenant isolation is not tested.** There are no automated cross-tenant tests. Past security sweeps were manual. A small suite that logs in as org A and tries to read/write org B across the main tables and RPCs would be high value.
8. **Money correctness** (cents math, refund allocation invariants, tax ordering) has been fixed through manual sweeps several times. It is the area most likely to regress silently without tests.

---

## 4. Who owns the architecture?

**Verdict: the architecture is coherent and unusually well-reasoned in the data layer, but its rationale lives in one person's head and an AI assistant's notes. The scale risks are real but ordinary.**

Sound decisions that a reviewer should keep:
- Multi-tenancy by `org_id` + RLS, with `org_id` from the session.
- Shared `vendors` table, products catalog as the single source for purchasable items, integer cents for money, soft deletes, status columns as text + CHECK, audit-trail trigger with child-to-parent rollup, approval workflows as RPCs, change orders RPC-only with a guard trigger.
- Clear separation of Equipt (CMMS + PO) and Landscapt (CRM/FSM) with a short documented list of sanctioned integration points.
- Computation in SQL views and RPCs for reporting (Report Center, KPI scorecards).

Scale and structure questions for an experienced engineer to answer:
1. **Reporting load.** ~70 reports and many `rpt_*` views run live over transactional tables. At larger tenant counts these need indexes, materialization, or a read replica. **Verify:** `EXPLAIN` the top reports on a realistically sized tenant.
2. **Indexing and RLS cost.** Policies that call functions per row (`my_org_id()`, `has_crm_access()`, restrictive policies on 85 CRM tables) can dominate query time. Check that `org_id` is indexed on every large table and that policy helper functions are marked `STABLE` and wrapped as `(select ...)`.
3. **Business logic is split across three places:** Postgres (RPCs/triggers), route handlers, and client hooks that write directly with the user's session. The last is a known pattern (e.g. `useUpdateVisit` plus a notify endpoint) and creates cases where server-side side effects depend on the client making a second call.
4. **Serverless limits.** 23 cron entries and several long-running operations (bulk price runs, QuickBooks sync, imports, report schedules) run on Vercel functions. Check `maxDuration`, idempotency, and retry behavior for each.
5. **Two environments and drift.** PROD and TEST are separate Supabase projects with a documented history of drift in both directions. A staging/promotion process should replace "apply to both by hand".
6. **Permission model complexity.** Three overlapping models: `crm_roles` permission keys (Landscapt), a fixed role set (Equipt, enforced on 29 tables), and an internal-org guard (Twins-only dashboards). Document the matrix and the intended end state.
7. **Product coupling.** Equipt/Landscapt decoupling is by convention only. Consider a lint rule or folder-boundary check so the "sanctioned integration points" rule is enforced, not remembered.
8. **Single-vendor dependencies:** Supabase, Vercel, Stripe, QuickBooks, Twilio, Resend, Google Maps. List each with owner, billing contact, and the cost of replacement.

**Recommendation:** have an experienced engineer or a short paid architecture review (1 to 2 days) validate items 1, 2, and 4 before onboarding a team. Those are the most likely to cause a production surprise as tenant count grows.

---

## 5. Handoff checklist (in priority order)

Week 1, low effort, high value:
- [x] Write `README.md`: what it is, prerequisites, how to run (`npm run dev:test`), env setup, where docs live.
- [x] Write `docs/ARCHITECTURE.md`: system diagram, request flow, auth/permission model, tenancy, crons, webhooks, integrations. Pull from `CLAUDE.md` and the migration headers.
- [x] Write `docs/INTEGRATIONS.md` (owner/login column still to be filled in by the current owner): each third-party service, owning account, keys, webhooks to configure, rotation steps.
- [x] Write `docs/RUNBOOKS.md` (TEST project ref, backup/PITR tier and uptime monitor still to confirm): PROD/TEST project refs, migration apply and drift recovery, rolling back a bad migration, key rotation, cron failures, build failures (OOM).
- [ ] Move the assistant's memory notes that encode decisions into `docs/decisions/` (ADR style). They are currently outside the repo.
- [x] Fix `CLAUDE.md` (test commands only; standards-vs-code drift remains): remove nonexistent test commands, correct the standards the code does not follow, or fix the code.
- [x] Clean repo root (screenshots, `test.txt`, `.docx`).
- [ ] Prove `supabase db reset` works from scratch.

Weeks 2 to 4:
- [x] CI: typecheck (lint and typecheck done; secret scan still open), lint, build on every PR; `npm audit`; secret scan; Dependabot.
- [ ] Add Vitest and write tests for the money paths, then a cross-tenant isolation suite.
- [ ] Audit all 110 service-role call sites and all `SECURITY DEFINER` functions; add CI checks for the latter.
- [ ] Regenerate `supabase.ts`; remove `as any` on data access in priority order.
- [ ] Triage the 340 swallowed-error sites; confirm Sentry coverage.

Quarter:
- [ ] Split the six largest files; move logic into `lib/`.
- [ ] Index and `EXPLAIN` review of reports and RLS helpers.
- [ ] Decide on `crew-app/` and the deferred `TASKS.md` features that look live in the UI.
- [ ] Consolidate the permission models.
