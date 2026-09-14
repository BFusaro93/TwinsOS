-- ── sales rep FK consistency: contracts, jobs, invoices ────────────────────────
-- Estimates/clients already use a real sales_rep_id FK to auth.users(id).
-- Contracts and jobs stored the rep as free text matched against employee
-- display names; invoices had no sales-rep field at all. This backfills a
-- matching FK on all three so commission reporting can attribute revenue
-- per-transaction instead of only via the client's default rep.

-- crm_jobs ───────────────────────────────────────────────────────────────────
alter table crm_jobs
  add column if not exists sales_rep_id uuid references auth.users(id) on delete set null;

update crm_jobs j
set sales_rep_id = e.user_id
from crm_employees e
where e.org_id = j.org_id
  and e.user_id is not null
  and j.sales_rep is not null
  and j.sales_rep_id is null
  and lower(trim(e.first_name || ' ' || e.last_name)) = lower(trim(j.sales_rep));

alter table crm_jobs rename column sales_rep to sales_rep_legacy_name;

-- crm_contracts ──────────────────────────────────────────────────────────────
alter table crm_contracts
  add column if not exists sales_rep_id uuid references auth.users(id) on delete set null;

update crm_contracts k
set sales_rep_id = e.user_id
from crm_employees e
where e.org_id = k.org_id
  and e.user_id is not null
  and k.sales_rep is not null
  and k.sales_rep_id is null
  and lower(trim(e.first_name || ' ' || e.last_name)) = lower(trim(k.sales_rep));

alter table crm_contracts rename column sales_rep to sales_rep_legacy_name;

-- crm_invoices ───────────────────────────────────────────────────────────────
-- Net-new: denormalized at insert time from whichever estimate/job/contract
-- produced the invoice (or set directly for ad-hoc invoices). Historical
-- invoices are left null rather than backfilled.
alter table crm_invoices
  add column if not exists sales_rep_id uuid references auth.users(id) on delete set null;
