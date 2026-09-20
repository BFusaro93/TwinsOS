-- ============================================================
-- Fix: the shared set_org_today_default() trigger errored on every table
-- except crm_invoices.
--
-- 20260919030000 used ONE trigger function for three tables, branching on
-- tg_argv[0]:
--
--   if tg_argv[0] = 'invoice_date'   and new.invoice_date   is null then ...
--   elsif tg_argv[0] = 'payment_date' and new.payment_date  is null then ...
--
-- PL/pgSQL hands each IF condition to the SQL executor as a whole expression,
-- and SQL does not guarantee short-circuit evaluation of AND — so `new
-- .invoice_date` is resolved even when tg_argv[0] is 'payment_date'. On a
-- crm_payments row there is no such field:
--
--   ERROR: record "new" has no field "invoice_date"
--
-- crm_invoices happened to work because invoice_date is the field it does
-- have. crm_payments and project_change_orders raised on any INSERT that
-- omitted the date, which is exactly the "let the DB decide today" path the
-- trigger existed to support. Callers that pass the column explicitly (most
-- of the app today) were unaffected, which is why this wasn't louder.
--
-- One function per column: each touches only its own table's field, so there
-- is nothing for the executor to resolve that isn't there.
-- ============================================================

create or replace function public.set_invoice_date_org_today()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.invoice_date is null then
    new.invoice_date := public.org_today(new.org_id);
  end if;
  return new;
end;
$$;

create or replace function public.set_payment_date_org_today()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.payment_date is null then
    new.payment_date := public.org_today(new.org_id);
  end if;
  return new;
end;
$$;

create or replace function public.set_requested_date_org_today()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.requested_date is null then
    new.requested_date := public.org_today(new.org_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_invoices_invoice_date on public.crm_invoices;
create trigger trg_crm_invoices_invoice_date
  before insert on public.crm_invoices
  for each row execute function public.set_invoice_date_org_today();

drop trigger if exists trg_crm_payments_payment_date on public.crm_payments;
create trigger trg_crm_payments_payment_date
  before insert on public.crm_payments
  for each row execute function public.set_payment_date_org_today();

drop trigger if exists trg_project_change_orders_requested_date on public.project_change_orders;
create trigger trg_project_change_orders_requested_date
  before insert on public.project_change_orders
  for each row execute function public.set_requested_date_org_today();

drop function if exists public.set_org_today_default();

-- ── estimate_date gets the same treatment ────────────────────────────────
-- It was being computed in TypeScript against a hardcoded Eastern clock.
-- Defaulting it here means every caller — the app, the v1 API, Zapier, MCP,
-- manual SQL — lands on the owning org's day without knowing the zone. The
-- column is NOT NULL with no default today, so omitting it currently fails
-- outright; this is strictly an improvement, with no "deliberate NULL"
-- semantics to preserve.
--
-- purchase_orders.po_date is deliberately NOT given this treatment: it is
-- nullable, and the PO CSV import writes NULL on purpose for a row with no
-- date (use-purchase-orders.ts). Auto-filling would silently turn those into
-- today. That one call site resolves the org zone in TypeScript instead.
create or replace function public.set_estimate_date_org_today()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.estimate_date is null then
    new.estimate_date := public.org_today(new.org_id);
  end if;
  return new;
end;
$$;

-- The column default has to go, or it fills estimate_date before the trigger
-- ever sees a NULL and the org's clock is ignored. Prod had already lost this
-- default; test still carried CURRENT_DATE (UTC), so the two environments
-- disagreed about what day a newly created estimate belonged to. Idempotent,
-- so it is safe on the environment that has none.
alter table public.estimates alter column estimate_date drop default;

drop trigger if exists trg_estimates_estimate_date on public.estimates;
create trigger trg_estimates_estimate_date
  before insert on public.estimates
  for each row execute function public.set_estimate_date_org_today();
