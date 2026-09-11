-- Price adjustment runs: re-price *live* client work in bulk, with a preview
-- before the write and a line-level undo after it.
--
-- Why this exists separately from the catalog bulk-price dialog: raising
-- crm_services.default_rate_cents moves no money. That column only seeds new
-- estimates, invoices and package lines. What actually bills is the per-client
-- snapshot in crm_job_services.rate_cents (see complete-visit-side-effects.ts,
-- which builds invoice line items from it and falls back to crm_jobs.rate_cents),
-- plus crm_packages.monthly_amount_cents for fixed-installment programs. A
-- price increase that doesn't touch those layers changes nothing a customer
-- ever pays.
--
-- Deliberately NOT touched by a run:
--   - crm_contracts (monthly_amount_cents plus the monthly_amounts and
--     invoice_line_items JSONB blobs). Re-pricing a signed contract is a
--     legal question, not a bulk operation, and the JSONB copies would drift
--     out of sync with the scalar column. Excluded by product decision.
--   - crm_invoice_line_items on existing invoices. Already-issued money is
--     history; a run changes what future visits bill, never what was sent.
--   - crm_job_visits.rate_cents. A per-visit rate is an override somebody set
--     on purpose for that one visit; a bulk run silently overwriting it is
--     exactly the surprise this feature is supposed to avoid.

-- ── adjustment maths, mirroring src/lib/pricing/adjust.ts ────────────────────
-- Kept in SQL so apply recomputes prices itself rather than trusting numbers
-- posted by the client. The two implementations must agree; if you change the
-- rounding rules here, change adjust.ts too.
create or replace function crm_adjust_price_cents(
  p_cents    integer,
  p_method   text,
  p_amount   numeric,
  p_rounding text
)
returns integer
language plpgsql
immutable
as $$
declare
  v_step integer;
  v_next numeric;
begin
  if p_cents is null then
    return null;
  end if;

  -- A percentage of nothing is nothing. Silently turning an unpriced line into
  -- a priced one mid-run is how a surprise lands on an invoice; use a flat
  -- adjustment to put a price on something that has none.
  if p_method = 'percent' then
    if p_cents = 0 then
      return 0;
    end if;
    v_next := p_cents * (1 + p_amount / 100.0);
  elsif p_method = 'flat' then
    v_next := p_cents + p_amount;
  else
    raise exception 'crm_adjust_price_cents: unknown method %', p_method;
  end if;

  v_step := case p_rounding
    when 'cent'    then 1
    when 'quarter' then 25
    when 'dollar'  then 100
    when 'five'    then 500
    else null
  end;
  if v_step is null then
    raise exception 'crm_adjust_price_cents: unknown rounding rule %', p_rounding;
  end if;

  v_next := round(v_next / v_step) * v_step;
  if v_next < 0 then
    v_next := 0;
  end if;
  return v_next::integer;
end;
$$;

-- ── run header ───────────────────────────────────────────────────────────────
create table if not exists crm_price_adjustments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) default my_org_id(),
  name         text not null,
  method       text not null check (method in ('percent', 'flat')),
  -- Whole percent when method = 'percent'; cents when method = 'flat'.
  amount       numeric not null,
  rounding     text not null check (rounding in ('cent', 'quarter', 'dollar', 'five')),
  -- {serviceIds:[], clientIds:[], jobTypes:[], packageIds:[]} — an absent or
  -- empty array means "no filter on that dimension".
  scope        jsonb not null default '{}'::jsonb,
  targets      text[] not null,
  status       text not null default 'applied' check (status in ('applied', 'reverted')),
  line_count   integer not null default 0,
  -- Signed sum of (new - old) across every line, in cents. Per-billing-period
  -- for job services, per-month for packages: a mixed run's total is only
  -- indicative, which is why the UI reports the two separately.
  delta_cents  bigint not null default 0,
  applied_at   timestamptz not null default now(),
  applied_by   uuid references auth.users(id) on delete set null,
  reverted_at  timestamptz,
  reverted_by  uuid references auth.users(id) on delete set null,
  notes        text,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  constraint crm_price_adjustments_targets_not_empty check (cardinality(targets) > 0)
);

create index if not exists crm_price_adjustments_org_idx
  on crm_price_adjustments(org_id, applied_at desc);

-- ── per-row before/after, which is also the undo record ──────────────────────
create table if not exists crm_price_adjustment_lines (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) default my_org_id(),
  adjustment_id   uuid not null references crm_price_adjustments(id) on delete cascade,
  entity_type     text not null check (entity_type in ('job_service', 'package', 'package_service')),
  entity_id       uuid not null,
  client_id       uuid references clients(id),
  job_id          uuid references crm_jobs(id) on delete set null,
  label           text not null,
  old_rate_cents  integer not null,
  new_rate_cents  integer not null,
  -- Set when a revert skipped this line because the live value had been
  -- changed by hand since the run — see crm_revert_price_adjustment().
  revert_skipped  boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists crm_price_adjustment_lines_run_idx
  on crm_price_adjustment_lines(adjustment_id);
create index if not exists crm_price_adjustment_lines_entity_idx
  on crm_price_adjustment_lines(org_id, entity_type, entity_id);

alter table crm_price_adjustments      enable row level security;
alter table crm_price_adjustment_lines enable row level security;

drop policy if exists "org members manage price adjustments" on crm_price_adjustments;
create policy "org members manage price adjustments"
  on crm_price_adjustments for all
  using (org_id = my_org_id())
  with check (org_id = my_org_id());

drop policy if exists "org members manage price adjustment lines" on crm_price_adjustment_lines;
create policy "org members manage price adjustment lines"
  on crm_price_adjustment_lines for all
  using (org_id = my_org_id())
  with check (org_id = my_org_id());

-- Same employee-link gate every other CRM business table carries
-- (20260906210000_wide_crm_rls_tightening_restrictive_policies.sql).
drop policy if exists "require_crm_access" on crm_price_adjustments;
create policy "require_crm_access" on crm_price_adjustments
  as restrictive for all
  using (has_crm_access()) with check (has_crm_access());

drop policy if exists "require_crm_access" on crm_price_adjustment_lines;
create policy "require_crm_access" on crm_price_adjustment_lines
  as restrictive for all
  using (has_crm_access()) with check (has_crm_access());

-- ── candidate set ────────────────────────────────────────────────────────────
-- Preview and apply both go through this one function, so what the user
-- approves on screen is definitionally what gets written. Security invoker:
-- RLS on the underlying tables does the tenant scoping, and the explicit
-- org_id = my_org_id() filters below are belt-and-braces on top of it.
create or replace function crm_price_adjustment_candidates(
  p_method   text,
  p_amount   numeric,
  p_rounding text,
  p_scope    jsonb,
  p_targets  text[]
)
returns table (
  entity_type    text,
  entity_id      uuid,
  client_id      uuid,
  job_id         uuid,
  label          text,
  old_rate_cents integer,
  new_rate_cents integer
)
language sql
stable
as $$
  with scope as (
    select
      coalesce(array(select jsonb_array_elements_text(p_scope -> 'serviceIds'))::uuid[], '{}') as service_ids,
      coalesce(array(select jsonb_array_elements_text(p_scope -> 'clientIds'))::uuid[],  '{}') as client_ids,
      coalesce(array(select jsonb_array_elements_text(p_scope -> 'jobTypes')),            '{}') as job_types,
      coalesce(array(select jsonb_array_elements_text(p_scope -> 'packageIds'))::uuid[],  '{}') as package_ids
  )
  -- Live job service lines: the layer that actually bills.
  select
    'job_service'::text,
    js.id,
    j.client_id,
    j.id,
    coalesce(c.display_name, 'Client') || ' · ' || coalesce(js.service_name, 'Service')
      || ' (Job #' || j.job_number || ')',
    js.rate_cents,
    crm_adjust_price_cents(js.rate_cents, p_method, p_amount, p_rounding)
  from crm_job_services js
  join crm_jobs j on j.id = js.job_id
  left join clients c on c.id = j.client_id
  cross join scope s
  where 'job_service' = any(p_targets)
    and js.org_id = my_org_id()
    and j.deleted_at is null
    and js.rate_cents is not null
    and coalesce(js.included, true)
    -- Finished and abandoned work is history; only future billing moves.
    and j.status not in ('completed', 'cancelled', 'skipped')
    and (cardinality(s.service_ids) = 0 or js.service_id = any(s.service_ids))
    and (cardinality(s.client_ids)  = 0 or j.client_id   = any(s.client_ids))
    and (cardinality(s.job_types)   = 0 or j.job_type    = any(s.job_types))

  union all

  -- Fixed monthly package installments.
  select
    'package'::text,
    p.id,
    null::uuid,
    null::uuid,
    'Package · ' || p.name,
    p.monthly_amount_cents,
    crm_adjust_price_cents(p.monthly_amount_cents, p_method, p_amount, p_rounding)
  from crm_packages p
  cross join scope s
  where 'package' = any(p_targets)
    and p.org_id = my_org_id()
    and p.deleted_at is null
    and p.monthly_amount_cents is not null
    and (cardinality(s.package_ids) = 0 or p.id = any(s.package_ids))

  union all

  -- Per-service rates inside a package.
  select
    'package_service'::text,
    ps.id,
    null::uuid,
    null::uuid,
    'Package · ' || coalesce(p.name, '?') || ' · ' || coalesce(ps.service_name, ps.name, 'Service'),
    ps.default_rate_cents,
    crm_adjust_price_cents(ps.default_rate_cents, p_method, p_amount, p_rounding)
  from crm_package_services ps
  join crm_packages p on p.id = ps.package_id
  cross join scope s
  where 'package_service' = any(p_targets)
    and ps.org_id = my_org_id()
    and ps.deleted_at is null
    and p.deleted_at is null
    and ps.default_rate_cents is not null
    and (cardinality(s.package_ids) = 0 or ps.package_id = any(s.package_ids))
    and (cardinality(s.service_ids) = 0 or ps.service_id = any(s.service_ids))
$$;

-- ── apply ────────────────────────────────────────────────────────────────────
-- Recomputes the candidate set itself rather than accepting prices from the
-- client, records every before/after, then writes. One statement per target
-- table so the whole run is a single transaction: it either all lands or none
-- of it does.
create or replace function crm_apply_price_adjustment(
  p_name     text,
  p_method   text,
  p_amount   numeric,
  p_rounding text,
  p_scope    jsonb,
  p_targets  text[],
  p_notes    text default null
)
returns uuid
language plpgsql
as $$
declare
  v_id    uuid;
  v_org   uuid := my_org_id();
  v_count integer;
  v_delta bigint;
begin
  if v_org is null then
    raise exception 'crm_apply_price_adjustment: no org for current user';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'crm_apply_price_adjustment: name is required';
  end if;

  insert into crm_price_adjustments (
    org_id, name, method, amount, rounding, scope, targets, notes,
    applied_by, created_by
  )
  values (
    v_org, btrim(p_name), p_method, p_amount, p_rounding,
    coalesce(p_scope, '{}'::jsonb), p_targets, p_notes,
    auth.uid(), auth.uid()
  )
  returning id into v_id;

  -- Only rows whose price actually moves are recorded. A no-op line would
  -- otherwise bloat the undo record and overstate what the run did.
  insert into crm_price_adjustment_lines (
    org_id, adjustment_id, entity_type, entity_id, client_id, job_id,
    label, old_rate_cents, new_rate_cents
  )
  select v_org, v_id, c.entity_type, c.entity_id, c.client_id, c.job_id,
         c.label, c.old_rate_cents, c.new_rate_cents
  from crm_price_adjustment_candidates(p_method, p_amount, p_rounding, p_scope, p_targets) c
  where c.new_rate_cents is distinct from c.old_rate_cents;

  update crm_job_services js
  set rate_cents = l.new_rate_cents
  from crm_price_adjustment_lines l
  where l.adjustment_id = v_id
    and l.entity_type = 'job_service'
    and js.id = l.entity_id
    and js.org_id = v_org;

  update crm_packages p
  set monthly_amount_cents = l.new_rate_cents,
      updated_at = now()
  from crm_price_adjustment_lines l
  where l.adjustment_id = v_id
    and l.entity_type = 'package'
    and p.id = l.entity_id
    and p.org_id = v_org;

  update crm_package_services ps
  set default_rate_cents = l.new_rate_cents
  from crm_price_adjustment_lines l
  where l.adjustment_id = v_id
    and l.entity_type = 'package_service'
    and ps.id = l.entity_id
    and ps.org_id = v_org;

  select count(*), coalesce(sum(new_rate_cents - old_rate_cents), 0)
  into v_count, v_delta
  from crm_price_adjustment_lines
  where adjustment_id = v_id;

  update crm_price_adjustments
  set line_count = v_count, delta_cents = v_delta, updated_at = now()
  where id = v_id;

  return v_id;
end;
$$;

-- ── revert ───────────────────────────────────────────────────────────────────
-- Restores old_rate_cents, but only on rows still sitting at the value the run
-- wrote. A line somebody re-priced by hand since is left alone and flagged
-- revert_skipped, because blindly restoring it would silently discard a
-- deliberate later decision.
create or replace function crm_revert_price_adjustment(p_id uuid)
returns table (reverted integer, skipped integer)
language plpgsql
as $$
declare
  v_org       uuid := my_org_id();
  v_status    text;
  v_reverted  integer := 0;
  v_skipped   integer := 0;
  v_n         integer;
begin
  select status into v_status
  from crm_price_adjustments
  where id = p_id and org_id = v_org and deleted_at is null;

  if v_status is null then
    raise exception 'crm_revert_price_adjustment: run % not found', p_id;
  end if;
  if v_status = 'reverted' then
    raise exception 'crm_revert_price_adjustment: run % is already reverted', p_id;
  end if;

  -- Flag drifted lines first so the restores below can simply skip them.
  update crm_price_adjustment_lines l
  set revert_skipped = true
  where l.adjustment_id = p_id
    and l.org_id = v_org
    and (
      (l.entity_type = 'job_service' and not exists (
        select 1 from crm_job_services js
        where js.id = l.entity_id and js.rate_cents = l.new_rate_cents))
      or (l.entity_type = 'package' and not exists (
        select 1 from crm_packages p
        where p.id = l.entity_id and p.monthly_amount_cents = l.new_rate_cents))
      or (l.entity_type = 'package_service' and not exists (
        select 1 from crm_package_services ps
        where ps.id = l.entity_id and ps.default_rate_cents = l.new_rate_cents))
    );
  get diagnostics v_skipped = row_count;

  update crm_job_services js
  set rate_cents = l.old_rate_cents
  from crm_price_adjustment_lines l
  where l.adjustment_id = p_id
    and l.org_id = v_org
    and l.entity_type = 'job_service'
    and not l.revert_skipped
    and js.id = l.entity_id
    and js.org_id = v_org;
  get diagnostics v_n = row_count;
  v_reverted := v_reverted + v_n;

  update crm_packages p
  set monthly_amount_cents = l.old_rate_cents,
      updated_at = now()
  from crm_price_adjustment_lines l
  where l.adjustment_id = p_id
    and l.org_id = v_org
    and l.entity_type = 'package'
    and not l.revert_skipped
    and p.id = l.entity_id
    and p.org_id = v_org;
  get diagnostics v_n = row_count;
  v_reverted := v_reverted + v_n;

  update crm_package_services ps
  set default_rate_cents = l.old_rate_cents
  from crm_price_adjustment_lines l
  where l.adjustment_id = p_id
    and l.org_id = v_org
    and l.entity_type = 'package_service'
    and not l.revert_skipped
    and ps.id = l.entity_id
    and ps.org_id = v_org;
  get diagnostics v_n = row_count;
  v_reverted := v_reverted + v_n;

  update crm_price_adjustments
  set status = 'reverted', reverted_at = now(), reverted_by = auth.uid(), updated_at = now()
  where id = p_id and org_id = v_org;

  return query select v_reverted, v_skipped;
end;
$$;

revoke execute on function crm_adjust_price_cents(integer, text, numeric, text) from public, anon;
-- Re-granted explicitly: the revoke above strips authenticated's default
-- grant too, and crm_price_adjustment_candidates is security invoker, so the
-- caller needs execute on the helper it calls.
grant  execute on function crm_adjust_price_cents(integer, text, numeric, text) to authenticated;
grant  execute on function crm_price_adjustment_candidates(text, numeric, text, jsonb, text[]) to authenticated;
grant  execute on function crm_apply_price_adjustment(text, text, numeric, text, jsonb, text[], text) to authenticated;
grant  execute on function crm_revert_price_adjustment(uuid) to authenticated;

-- ── on auditing ──────────────────────────────────────────────────────────────
-- fn_audit_log() fires on crm_services and crm_packages but not on
-- crm_job_services, so a per-client rate change leaves no audit_log trail.
-- Deliberately NOT fixed here: crm_job_services is a hot table (job creation
-- and estimate conversion insert a row per service line), fn_audit_log() is
-- heavy, and it has no mapping for this table so rows would land with
-- record_type = 'crm_job_services' and likely not render in the audit UI.
-- crm_price_adjustment_lines above already gives price runs a complete
-- before/after record plus undo, which is what this feature needs. Auditing
-- every crm_job_services write is a separate decision with its own
-- performance and UI work.
