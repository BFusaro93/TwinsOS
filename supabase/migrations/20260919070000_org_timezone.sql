-- ============================================================
-- Per-org operating timezone.
--
-- Until now "the company's day" meant America/New_York, hardcoded in ~20
-- places across SQL and TypeScript (see 20260919020000, which fixed the
-- separate bug of deriving business dates from UTC). That is correct for an
-- Eastern tenant and wrong for everyone else: a Pacific org's service day,
-- report ranges and scheduled-report hours would all run on Eastern
-- boundaries.
--
-- The timezone belongs to the ORG, not the viewer. A manager checking the
-- board from another state must still see the crew's day.
-- ============================================================

alter table public.organizations
  add column if not exists timezone text not null default 'America/New_York';

-- Validate against the IANA zones Postgres itself knows, so a typo can't be
-- stored and then silently fall back at read time. pg_timezone_names is a
-- view, so this has to be a trigger rather than a CHECK (CHECK constraints
-- can't contain subqueries).
create or replace function public.organizations_validate_timezone()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.timezone is null or btrim(new.timezone) = '' then
    new.timezone := 'America/New_York';
  end if;
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone %; expected an IANA name such as America/Chicago', new.timezone;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_organizations_validate_timezone on public.organizations;
create trigger trg_organizations_validate_timezone
  before insert or update of timezone on public.organizations
  for each row execute function public.organizations_validate_timezone();

-- ── resolvers ────────────────────────────────────────────────────────────
-- Both fall back to Eastern rather than erroring. A missing org row must not
-- be able to block an invoice from being written; landing on the historical
-- default is the safe failure.
create or replace function public.org_timezone(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select o.timezone from public.organizations o where o.id = p_org_id),
    'America/New_York'
  );
$$;

comment on function public.org_timezone(uuid) is
  'The org''s IANA operating timezone. SECURITY DEFINER so a row-level policy on organizations cannot make a date derivation fail.';

create or replace function public.org_today(p_org_id uuid)
returns date
language sql
stable
security definer
set search_path to 'public'
as $$
  select (now() at time zone public.org_timezone(p_org_id))::date;
$$;

comment on function public.org_today(uuid) is
  'Today''s calendar date on the org''s own clock. Use instead of current_date, which is UTC and rolls over mid-evening in the Americas.';

create or replace function public.my_timezone()
returns text
language sql
stable
set search_path to 'public'
as $$ select public.org_timezone(public.my_org_id()); $$;

create or replace function public.my_today()
returns date
language sql
stable
set search_path to 'public'
as $$ select public.org_today(public.my_org_id()); $$;

revoke all on function public.org_timezone(uuid) from anon;
revoke all on function public.org_today(uuid)    from anon;
revoke all on function public.my_timezone()      from anon;
revoke all on function public.my_today()         from anon;
grant execute on function public.org_timezone(uuid) to authenticated, service_role;
grant execute on function public.org_today(uuid)    to authenticated, service_role;
grant execute on function public.my_timezone()      to authenticated, service_role;
grant execute on function public.my_today()         to authenticated, service_role;

-- ── date defaults become triggers ────────────────────────────────────────
-- A column DEFAULT can't see the row's org_id, and my_org_id() is null for a
-- service-role insert (the cron/webhook paths), so it can't be used in a
-- default either. A BEFORE INSERT trigger can read NEW.org_id directly, which
-- is correct for every caller regardless of how it authenticated.
create or replace function public.set_org_today_default()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_argv[0] = 'invoice_date' and new.invoice_date is null then
    new.invoice_date := public.org_today(new.org_id);
  elsif tg_argv[0] = 'payment_date' and new.payment_date is null then
    new.payment_date := public.org_today(new.org_id);
  elsif tg_argv[0] = 'requested_date' and new.requested_date is null then
    new.requested_date := public.org_today(new.org_id);
  end if;
  return new;
end;
$$;

-- Drop the column default so the column can be NULL on arrival and the
-- trigger gets a chance to fill it. Leaving the default in place would mean
-- the trigger never sees a NULL and the org's clock is ignored.
alter table public.crm_invoices          alter column invoice_date   drop default;
alter table public.crm_payments          alter column payment_date   drop default;
alter table public.project_change_orders alter column requested_date drop default;

drop trigger if exists trg_crm_invoices_invoice_date on public.crm_invoices;
create trigger trg_crm_invoices_invoice_date
  before insert on public.crm_invoices
  for each row execute function public.set_org_today_default('invoice_date');

drop trigger if exists trg_crm_payments_payment_date on public.crm_payments;
create trigger trg_crm_payments_payment_date
  before insert on public.crm_payments
  for each row execute function public.set_org_today_default('payment_date');

drop trigger if exists trg_project_change_orders_requested_date on public.project_change_orders;
create trigger trg_project_change_orders_requested_date
  before insert on public.project_change_orders
  for each row execute function public.set_org_today_default('requested_date');

-- NOT NULL stays on all three: a BEFORE ROW trigger runs before constraints
-- are checked, so the column is already filled by the time NOT NULL is
-- evaluated. Dropping and restoring it would only open a window where a bad
-- insert could land.

-- ── date_sold: was hardcoded Eastern (20260906190000) ────────────────────
create or replace function public.crm_jobs_default_date_sold()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.date_sold is null then
    new.date_sold := public.org_today(new.org_id);
  end if;
  return new;
end;
$$;

-- ── milestone invoicing ──────────────────────────────────────────────────
-- Restated in full (not patched): this repo has twice lost in-DB guards to a
-- partial re-create. 20260919020000 moved this off current_date onto a
-- hardcoded Eastern expression; it now uses the org's own clock.
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
    public.org_today(v_org_id),
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
