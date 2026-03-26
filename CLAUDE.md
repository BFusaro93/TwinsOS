# PO + CMMS SaaS Platform

A combined **Purchase Order (PO)** and **Computerized Maintenance Management System (CMMS)** delivered as a multi-tenant SaaS. The primary industry context is **landscaping operations**, though the platform is designed to be industry-agnostic. Users include operations/maintenance teams, procurement/finance teams, and managers with approval authority.

---

## Tech Stack

- **Framework:** Next.js (App Router) with TypeScript — strict mode enabled
- **UI:** React functional components, Tailwind CSS, shadcn/ui
- **Backend:** Next.js API Routes (Route Handlers) + Supabase
- **Database:** Supabase (PostgreSQL) with Row Level Security (RLS)
- **Auth:** Supabase Auth (email/password + SSO)
- **File Storage:** Supabase Storage (attachments, invoices, manuals)
- **Deployment:** Vercel (frontend + API routes), Supabase cloud (DB + auth + storage)
- **State:** Zustand for client state; TanStack Query for server state / caching

---

## Architecture

```
src/
  app/                    # Next.js App Router pages and layouts
    (auth)/               # Login, signup, password reset
    (dashboard)/          # Authenticated app shell
      po/                 # Purchase Order module
        requisitions/     # Purchase Requisitions
        orders/           # Purchase Orders
        vendors/          # Vendor management (shared with CMMS)
        products/         # Stocked & project materials catalog
        projects/         # Landscaping jobs / project cost tracking
        receiving/        # Goods receipts
      cmms/               # CMMS module
        assets/           # Asset registry
        work-orders/      # Work Orders
        pm-schedules/     # Preventive Maintenance schedules
        parts/            # Parts inventory (linked to assets and PO)
        vendors/          # Vendor management (shared with PO)
      settings/           # Org settings, users, roles
  components/
    ui/                   # shadcn/ui primitives (DO NOT modify)
    shared/               # Shared business components (StatusBadge, ApprovalFlow, etc.)
    po/                   # PO-specific components
    cmms/                 # CMMS-specific components
  lib/
    supabase/             # Supabase client (browser + server)
    hooks/                # Shared React hooks
    utils/                # Pure utility functions
  types/                  # Shared TypeScript types and Zod schemas
  stores/                 # Zustand stores
```

### Two Core Modules — Keep Them Decoupled

**Purchase Order (PO) Module** — handles the full procurement lifecycle:
- Purchase Requisitions → PO creation → Approval workflows → Vendor management → Receiving → Invoice matching
- **Products section:** catalog of purchasable materials, split into three categories: `maintenance_part` (for CMMS), `stocked_material` (landscape supplies kept on hand), and `project_material` (job-specific materials). Every PO line item references a Products catalog entry.
- **Projects/Jobs section:** landscaping jobs that PO line items and materials can be assigned to for per-job cost tracking and reporting.

**CMMS Module** — handles asset and maintenance lifecycle:
- Asset registry → Preventive Maintenance (PM) schedules → Work Orders → Parts inventory → Labor tracking → Maintenance history
- **Parts section:** spare parts and consumables inventory. Each Part can be assigned to one or more Assets (the parts that asset typically requires). Parts are replenished via PO → Goods Receipt → Parts inventory flow.

**Integration points** between modules (the only sanctioned ones):
1. A Work Order can spawn a Purchase Requisition when parts are needed
2. PO line items (category `maintenance_part`) can be received into CMMS Parts inventory
3. **Vendors are shared** — the `vendors` table is module-agnostic. A vendor may supply both landscape materials (PO) and maintenance parts/services (CMMS). Vendor UI is surfaced in both modules but writes to the same underlying table.
4. A PO line item of category `project_material` can be assigned a `project_id` from the Projects/Jobs section

Do not create cross-module dependencies beyond these four points. Keep all other module logic in its own directory.

---

## Key Domain Concepts

Understand these terms — use them consistently in code, variables, and comments:

| Term | Meaning |
|---|---|
| `Tenant` | A customer organization (multi-tenant — all data is scoped by `org_id`) |
| `Asset` | A physical piece of equipment tracked in CMMS (pump, HVAC unit, vehicle, etc.) |
| `WorkOrder` | A task to inspect, repair, or maintain an Asset |
| `PMSchedule` | A recurring maintenance schedule linked to an Asset |
| `Part` | A spare part or consumable in CMMS inventory; can be assigned to one or more Assets |
| `AssetPart` | Join record linking a Part to an Asset (the parts that asset typically uses) |
| `Requisition` | An internal request to purchase something (pre-PO) |
| `PurchaseOrder` | A formal PO sent to a Vendor |
| `Vendor` | An external supplier of goods or services — shared across PO and CMMS modules |
| `ProductItem` | A catalog entry for a purchasable material/part. Has a `category`: `maintenance_part`, `stocked_material`, or `project_material` |
| `Project` | A landscaping job. PO line items and materials can be assigned to a Project for cost tracking |
| `ApprovalFlow` | A configurable chain of approvers for Requisitions and POs |
| `LineItem` | A line on a Requisition or PO (quantity, unit cost, GL code, optional `project_id`, references a `ProductItem`) |
| `GoodsReceipt` | Record of physical receipt of PO line items; triggers inventory update for `maintenance_part` category |
| `Role` | User permission level: `admin`, `manager`, `technician`, `purchaser`, `viewer` |

---

## Database Conventions (Supabase / PostgreSQL)

- All tables have: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `org_id uuid NOT NULL`, `created_at timestamptz`, `updated_at timestamptz`, `created_by uuid`
- **Row Level Security (RLS) is always enabled.** Every table must have RLS policies. Never disable RLS to work around a problem — fix the policy instead.
- `org_id` is always a foreign key to the `organizations` table. All queries must be scoped to the authenticated user's `org_id`.
- Use `snake_case` for all table and column names.
- Soft deletes only — use `deleted_at timestamptz` nullable column. Never hard delete records.
- Status columns use `text` with a CHECK constraint, not enums (easier to migrate).
- All monetary values stored as `integer` (cents) — never `float`.

---

## Auth & Multi-Tenancy Rules

- Every authenticated user belongs to exactly one `org_id` (stored in `user_metadata` and the `profiles` table).
- Use the Supabase server client (`createServerClient`) in all Route Handlers and Server Components — never the browser client on the server.
- The `org_id` must always come from the authenticated session, never from a request parameter or body. This prevents tenant cross-contamination.
- Role-based access is enforced at two layers: RLS in the DB AND middleware checks in Route Handlers.

---

## Approval Workflow Rules

- Requisitions and POs both have configurable approval chains stored in the `approval_flows` table.
- Approval state machine: `draft` → `pending_approval` → `approved` | `rejected` → (if approved) `ordered` | `closed`
- When a record moves to `pending_approval`, insert rows into `approval_requests` for each approver in the chain.
- Notify via Supabase Realtime (in-app) and email. Email triggers:
  - **Approval requested** → notify the next approver in the chain
  - **Approved** → notify the original requester
  - **Rejected** → notify the original requester with the rejection reason
- Only the current approver in the chain can approve/reject — enforce this server-side.

---

## Commands

```bash
# Development
npm run dev               # Start Next.js dev server (localhost:3000)
npm run build             # Production build
npm run lint              # ESLint check
npm run typecheck         # tsc --noEmit

# Supabase (local dev)
npx supabase start        # Start local Supabase stack
npx supabase db reset     # Reset local DB and re-run all migrations
npx supabase db push      # Push migration to remote
npx supabase gen types    # Regenerate TypeScript types from DB schema
                          # Output: src/types/supabase.ts — commit this file

# Testing
npm run test              # Vitest unit tests
npm run test:e2e          # Playwright end-to-end tests
```

Run `npx supabase gen types` after every schema migration and commit the updated `src/types/supabase.ts`.

---

## Coding Conventions

- **TypeScript strict mode** — no `any`, no `ts-ignore` without a comment explaining why.
- **Functional components only** — no class components.
- **Named exports only** — no default exports except Next.js page/layout files (required by the framework).
- **Server Components by default** — add `"use client"` only when the component needs browser APIs or interactivity.
- **Zod for all validation** — validate at the API boundary (Route Handlers) before touching the DB. Schemas live in `src/types/`.
- **TanStack Query for all data fetching** on the client — no raw `fetch` in components.
- **Never expose internal IDs in URLs** — use slugs or UUIDs only; never auto-increment integers in routes.
- **Optimistic UI** for status updates (approve/reject buttons, work order status changes) — use TanStack Query's `onMutate`.

---

## Gotchas & Known Traps

- **Supabase RLS + joins:** When joining tables, RLS applies per-table. A join does not bypass RLS on the joined table. Test policies explicitly.
- **Supabase server client in Next.js:** Use `@supabase/ssr` package. Do not use `@supabase/supabase-js` directly in Server Components — it lacks cookie handling.
- **Monetary arithmetic:** All money is in cents (integer). Format for display in components using a `formatCurrency(cents: number)` utility — never store or compute with formatted strings.
- **Approval chain ordering:** `approval_requests` rows have an `order` integer. Always fetch and process them in `ORDER BY order ASC`.
- **Soft deletes in queries:** All list queries must include `WHERE deleted_at IS NULL`. Create a Supabase view or use a query helper to enforce this — don't rely on remembering it per query.
- **Work Order → Requisition link:** When creating a Requisition from a Work Order, always store `work_order_id` on the `requisitions` row.
- **Vendors are truly shared:** The `vendors` table has no `module` column. Do not add one. Both PO and CMMS vendor UIs read/write the same rows. Vendor components live in `components/shared/`.
- **Parts ↔ Assets is a many-to-many:** Use the `asset_parts` join table. A Part can belong to multiple Assets (e.g., an oil filter used across several machines). Never store `asset_id` directly on the `parts` row.
- **GoodsReceipt → Parts inventory:** On receipt of a `maintenance_part` line item, increment `parts.quantity_on_hand`. This is the only place quantity changes — do not update it elsewhere.
- **Products catalog is the single source of truth for purchasable items.** Every `line_items` row must reference a `product_items.id`. Do not allow free-text item descriptions on POs — they must be catalog entries first.
- **Project cost tracking:** `line_items.project_id` is nullable. Only `project_material` and `stocked_material` categories should have a `project_id`. Enforce this with a DB CHECK constraint or trigger.
- **Vercel + Supabase connection pooling:** Use the pooled connection string (port 6543) for all server-side queries. Direct connection (port 5432) is only for migrations.
- **File uploads:** All attachments go to Supabase Storage. Store only the storage path in the DB, never a full signed URL (they expire). Generate signed URLs at read time.

---

## What NOT to Do

- Do not use `getServerSideProps` or `getStaticProps` — this project uses App Router only.
- Do not write raw SQL strings in application code — use the Supabase query builder or RPC calls for complex queries.
- Do not add business logic to components — keep components presentational; logic goes in hooks or server actions.
- Do not create a new shared component until you have used the same pattern in at least two places.
- Do not use `console.log` in committed code — use a structured logger utility.
