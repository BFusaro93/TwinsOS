-- ============================================================
-- Stop deriving business dates from the UTC calendar.
--
-- Supabase runs every session with TimeZone = 'UTC', so `current_date` in
-- Postgres is the UTC day, not the day the business is having. Between 8pm
-- Eastern (EDT) and midnight, `current_date` is already TOMORROW. Verified on
-- the live DB at 22:46 America/New_York on 2026-09-18:
--
--   current_date                             -> 2026-09-19
--   (now() at time zone 'America/New_York')  -> 2026-09-18
--
-- So anything dated by `current_date` after 8pm ET lands on the wrong day, and
-- on the evening of the last day of a month it lands in the wrong MONTH —
-- which silently moves revenue between accounting periods.
--
-- The application layer already gets this right: it sends invoice_date /
-- payment_date explicitly, computed with isoNy() (src/lib/reports/ny-date.ts).
-- These DB-side derivations are the paths that bypass it — the column defaults
-- (reached by any insert that omits the column, including MCP/API writes and
-- manual SQL) and create_invoice_from_milestone, which hardcodes current_date
-- rather than taking a date parameter.
--
-- 'America/New_York' matches the constant the app hardcodes (COMPANY_TIME_ZONE
-- in src/lib/utils.ts). There is no per-org timezone column yet; when one
-- lands this is one of the places that has to consult it.
-- ============================================================

alter table public.crm_invoices
  alter column invoice_date set default (now() at time zone 'America/New_York')::date;

alter table public.crm_payments
  alter column payment_date set default (now() at time zone 'America/New_York')::date;

alter table public.project_change_orders
  alter column requested_date set default (now() at time zone 'America/New_York')::date;

-- Restated in full, not patched: this repo has repeatedly lost in-DB guards
-- when a later migration re-created a function from a partial copy (see the
-- price-run permission regression and set_job_product_status). The org check,
-- the row lock, the already-invoiced check, the project derivation and the
-- percentage re-resolution below are all live behaviour that must survive.
create or replace function public.create_invoice_from_milestone(
  p_milestone_id uuid,
  p_client_id    uuid,
  p_sales_rep_id uuid default null::uuid,
  p_po_number    text default null::text
)
returns table(invoice_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org_id      uuid;
  v_estimate_id uuid;
  v_project_id  uuid;
  v_name        text;
  v_amount      integer;
  v_status      text;
  v_type        text;
  v_value       integer;
  v_basis       integer;
  v_invoice_id  uuid;
begin
  select org_id, estimate_id, project_id, name, amount_cents, status, milestone_type, milestone_value
    into v_org_id, v_estimate_id, v_project_id, v_name, v_amount, v_status, v_type, v_value
    from public.estimate_milestones
    where id = p_milestone_id
    for update;

  if not found then
    raise exception 'Milestone not found';
  end if;

  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  if v_status = 'invoiced' then
    raise exception 'Milestone already invoiced';
  end if;

  -- A milestone invoiced from the estimate side still belongs to the project
  -- that estimate became, so the project's Billing tab and the WIP report see
  -- it without the user having to bill from the project specifically.
  if v_project_id is null and v_estimate_id is not null then
    select j.project_id into v_project_id
    from public.crm_jobs j
    where j.estimate_id = v_estimate_id
      and j.project_id is not null
      and j.deleted_at is null
    limit 1;
  end if;

  -- Re-resolve a percentage against whatever the contract says right now.
  if v_type = 'percent' then
    if v_project_id is not null then
      select contract_price into v_basis from public.projects where id = v_project_id;
    else
      select total_cents into v_basis from public.estimates where id = v_estimate_id;
    end if;

    -- A zero/absent basis would silently bill $0. Keep the last known good
    -- snapshot instead, so a half-configured project can't erase an invoice.
    if coalesce(v_basis, 0) > 0 then
      v_amount := round(v_basis::numeric * v_value / 10000);
    end if;
  end if;

  if coalesce(v_amount, 0) <= 0 then
    raise exception 'Milestone amount must be greater than zero';
  end if;

  insert into public.crm_invoices (
    org_id, created_by, client_id, estimate_id, project_id, sales_rep_id, description,
    invoice_date, po_number, subtotal_cents, total_cents, balance_cents, status
  ) values (
    v_org_id, auth.uid(), p_client_id, v_estimate_id, v_project_id, p_sales_rep_id, v_name,
    -- was current_date (UTC) — see the header note
    (now() at time zone 'America/New_York')::date,
    p_po_number, v_amount, v_amount, v_amount, 'draft'
  )
  returning id into v_invoice_id;

  insert into public.crm_invoice_line_items (
    org_id, invoice_id, name, description, qty, rate_cents, total_cents, sort_order
  ) values (
    v_org_id, v_invoice_id, v_name, '', 1, v_amount, v_amount, 0
  );

  -- Write the resolved figure back so the schedule, the sums on it, and the
  -- invoice all report the same number afterwards.
  update public.estimate_milestones
  set status = 'invoiced', invoice_id = v_invoice_id, amount_cents = v_amount
  where id = p_milestone_id;

  return query select v_invoice_id;
end;
$function$;
