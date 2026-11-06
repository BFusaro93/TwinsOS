-- Chemical tracking integrity (pesticide application records).
--
-- 1. Crew logins are read-only on crm_chemical_applications. The table's
--    "org members can manage" FOR ALL policy plus require_crm_access (true for
--    crew) let a crew login INSERT/UPDATE/DELETE any chemical record in the org
--    through PostgREST — around the confirm/add routes' guards (already
--    confirmed, visit closed out, not clocked in, lookup ids of another org) and
--    moving stock through the inventory trigger. Every crew write already goes
--    through those routes with the service role, so the crew role is refused
--    direct writes (same RESTRICTIVE pattern as 20261223000301). SELECT stays:
--    the crew stop page reads its stop's records with the crew session.
--
-- 2. chem_add_edit_usage is enforced in the database for office sessions
--    (pattern: 20261207000100 helpers). Exception: dispatch preloads a
--    service's chemicals as unconfirmed PLAN rows for whoever dispatches, so an
--    unconfirmed preloaded row on a visit nobody has worked yet needs no key.
--    Same trigger: on a visit that hasn't started (no clock-in, not in progress
--    or completed) an office-added chemical is forced to be a plan (preloaded,
--    unconfirmed) — the crew confirms what they apply — and a plan row can't be
--    turned back into a non-preloaded one. Office adds had been saved as
--    applied, so a visit's planned chemicals were in the compliance report,
--    mailed as a Notice of Treatment and (once the visit was completed) taken
--    out of stock whether or not they went down. An explicit office confirmation
--    ("Confirm all as planned") stays allowed: it is how a visit worked without
--    the crew app gets past the crew_required gate, and a confirmed row still
--    counts only once its visit is in progress / completed.
--
-- 3. chemical_confirmation_waived_* can only be set by the admin-only
--    waive_chemical_confirmation RPC (the crew's "crew updates own crew visits"
--    policy let a crew login set it directly and complete without confirming).
--
-- 4. A visit or job with confirmed chemical applications can't be soft-deleted
--    once it was worked: deleting it dropped the applications from the
--    compliance report and (visit) put the product back in stock. The office
--    removes the applications first (a deliberate, audited act).
--
-- 5. Stock depletion keeps sub-cent remainders. quantity_on_hand is
--    numeric(10,2) and each application's deduction was rounded to 0.01, so a
--    0.004 gal application never depleted anything. The exact amount is now
--    recorded on the application and the rounding remainder is carried per
--    product (crm_chemical_stock_remainders) into the next application.
--
-- 6. At most one default application rate per product.

-- ── 1. crew read-only ───────────────────────────────────────────────────────
drop policy if exists crew_role_no_direct_write_ins on public.crm_chemical_applications;
drop policy if exists crew_role_no_direct_write_upd on public.crm_chemical_applications;
drop policy if exists crew_role_no_direct_write_del on public.crm_chemical_applications;
create policy crew_role_no_direct_write_ins on public.crm_chemical_applications as restrictive for insert
  with check (coalesce(public.my_role(), '') <> 'crew');
create policy crew_role_no_direct_write_upd on public.crm_chemical_applications as restrictive for update
  using (coalesce(public.my_role(), '') <> 'crew')
  with check (coalesce(public.my_role(), '') <> 'crew');
create policy crew_role_no_direct_write_del on public.crm_chemical_applications as restrictive for delete
  using (coalesce(public.my_role(), '') <> 'crew');

-- ── 2. permission + plan-only guard ────────────────────────────────────────
-- Has the visit been worked? Mirrors src/lib/chemical/visit-started.ts.
-- SECURITY INVOKER: a visit the caller can't see reads as not started, which
-- only ever makes their write a plan.
create or replace function public._chem_visit_started(p_visit_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.crm_job_visits v
    where v.id = p_visit_id
      and (v.clocked_in_at is not null or v.status in ('in_progress', 'completed'))
  );
$$;
revoke all on function public._chem_visit_started(uuid) from public, anon;
grant execute on function public._chem_visit_started(uuid) to authenticated, service_role;

create or replace function public.enforce_chemical_application_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_started boolean;
begin
  -- Service role (crew routes, cron), SECURITY DEFINER RPCs and trigger cascades
  -- (the inventory sync) carry their own checks.
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_started := new.visit_id is null or public._chem_visit_started(new.visit_id);
    if not v_started then
      -- Not worked yet: whatever the office adds is the plan.
      new.preloaded := true;
      new.confirmed_at := null;
      new.confirmed_by := null;
      -- Dispatch preloading, for whoever dispatches.
      return new;
    end if;
    if public._crm_has_any_permission(array['chem_add_edit_usage']) then
      return new;
    end if;
    raise exception 'You do not have permission to record chemical usage' using errcode = '42501';
  end if;

  if not public._crm_has_any_permission(array['chem_add_edit_usage']) then
    raise exception 'You do not have permission to edit chemical usage' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.visit_id is not null
     and old.preloaded and not new.preloaded
     and not public._chem_visit_started(new.visit_id) then
    raise exception 'This visit hasn''t been worked yet, so its chemicals are the plan — the crew confirms what they apply.'
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists a_crm_chemical_applications_enforce_write on public.crm_chemical_applications;
create trigger a_crm_chemical_applications_enforce_write
  before insert or update or delete on public.crm_chemical_applications
  for each row execute function public.enforce_chemical_application_write();

-- ── 3. waiver only through the admin RPC ───────────────────────────────────
create or replace function public.guard_chemical_confirmation_waiver()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.chemical_confirmation_waived_at is distinct from old.chemical_confirmation_waived_at
      or new.chemical_confirmation_waived_by is distinct from old.chemical_confirmation_waived_by)
     and public._crm_direct_user_write()
     and coalesce(current_setting('app.chemical_waiver_rpc', true), '') <> 'on' then
    raise exception 'Only an admin can let a visit be completed without chemical confirmation'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists a_crm_job_visits_guard_chemical_waiver on public.crm_job_visits;
create trigger a_crm_job_visits_guard_chemical_waiver
  before update of chemical_confirmation_waived_at, chemical_confirmation_waived_by on public.crm_job_visits
  for each row execute function public.guard_chemical_confirmation_waiver();

-- Live definition (TEST) with the GUC the guard above honours.
create or replace function public.waive_chemical_confirmation(p_visit_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid;
begin
  if (select role from public.profiles where id = auth.uid()) is distinct from 'admin' then
    raise exception 'only an admin can waive chemical confirmation' using errcode = '42501';
  end if;
  select org_id into v_org from public.crm_job_visits where id = p_visit_id and deleted_at is null;
  if v_org is null or v_org is distinct from public.my_org_id() then
    raise exception 'visit not found' using errcode = 'P0002';
  end if;
  perform set_config('app.chemical_waiver_rpc', 'on', true);
  update public.crm_job_visits
  set chemical_confirmation_waived_at = now(),
      chemical_confirmation_waived_by = auth.uid()
  where id = p_visit_id;
  perform set_config('app.chemical_waiver_rpc', 'off', true);
end;
$function$;

-- ── 4. no deleting worked visits / jobs that hold applications ─────────────
create or replace function public.guard_delete_visit_with_chemicals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text;
begin
  if old.deleted_at is null and new.deleted_at is not null
     and (old.clocked_in_at is not null or old.status in ('in_progress', 'completed')) then
    select string_agg(distinct coalesce(p.name, 'a chemical'), ', ') into v_names
    from public.crm_chemical_applications ca
    left join public.product_items p on p.id = ca.product_id
    where ca.visit_id = old.id
      and ca.deleted_at is null
      and ca.used
      and (not ca.preloaded or ca.confirmed_at is not null);
    if v_names is not null then
      raise exception 'This visit has chemical applications on record (%). Remove them on the visit''s Chemicals tab first: deleting the visit would drop them from the compliance report and put the product back in stock.', v_names
        using errcode = 'P0001', hint = 'chemical_applications_on_record';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_job_visits_guard_chemical_delete on public.crm_job_visits;
create trigger trg_crm_job_visits_guard_chemical_delete
  before update of deleted_at on public.crm_job_visits
  for each row execute function public.guard_delete_visit_with_chemicals();

create or replace function public.guard_delete_job_with_chemicals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    select string_agg(distinct coalesce(p.name, 'a chemical'), ', ') into v_names
    from public.crm_chemical_applications ca
    left join public.crm_job_visits v on v.id = ca.visit_id
    left join public.product_items p on p.id = ca.product_id
    where ca.job_id = old.id
      and ca.deleted_at is null
      and ca.used
      and (not ca.preloaded or ca.confirmed_at is not null)
      and (ca.visit_id is null
           or (v.deleted_at is null and (v.clocked_in_at is not null or v.status in ('in_progress', 'completed'))));
    if v_names is not null then
      raise exception 'This job has chemical applications on record (%). Remove them from its visits first: deleting the job would drop them from the compliance report.', v_names
        using errcode = 'P0001', hint = 'chemical_applications_on_record';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_jobs_guard_chemical_delete on public.crm_jobs;
create trigger trg_crm_jobs_guard_chemical_delete
  before update of deleted_at on public.crm_jobs
  for each row execute function public.guard_delete_job_with_chemicals();

revoke all on function public.guard_delete_visit_with_chemicals() from public, anon;
revoke all on function public.guard_delete_job_with_chemicals() from public, anon;

-- ── 5. exact stock depletion ───────────────────────────────────────────────
create table if not exists public.crm_chemical_stock_remainders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.product_items(id) on delete cascade,
  -- Stock-unit amount applied but not yet taken out of quantity_on_hand
  -- (which holds 2 decimals). Always within +/- 0.005 after a sync.
  remainder numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  constraint crm_chemical_stock_remainders_product_uniq unique (product_id)
);
alter table public.crm_chemical_stock_remainders enable row level security;
drop policy if exists "org members read chemical stock remainders" on public.crm_chemical_stock_remainders;
create policy "org members read chemical stock remainders" on public.crm_chemical_stock_remainders
  for select using (org_id = public.my_org_id());
-- Written only by sync_chemical_application_inventory (SECURITY DEFINER).
revoke insert, update, delete on public.crm_chemical_stock_remainders from anon, authenticated;

-- Live definition (TEST); the deduction is now exact (no round(..., 2) on the
-- desired amount) and the 2-decimal stock column is fed through the remainder.
create or replace function public.sync_chemical_application_inventory(p_app_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  a public.crm_chemical_applications%rowtype;
  v_status text;
  v_inventory boolean;
  v_on_hand numeric;
  v_desired numeric := 0;
  v_have numeric;
  v_delta numeric;
  v_rem numeric;
  v_total numeric;
  v_step numeric;
  v_short numeric;
begin
  select * into a from public.crm_chemical_applications where id = p_app_id;
  if not found then
    return;
  end if;

  select status into v_status from public.crm_job_visits where id = a.visit_id and deleted_at is null;
  select is_inventory into v_inventory
  from public.product_items where id = a.product_id and deleted_at is null;

  if a.deleted_at is null and a.used and v_status = 'completed' and coalesce(v_inventory, false)
     and (not a.preloaded or a.confirmed_at is not null) then
    v_desired := coalesce(public.chem_amount_in_stock_unit(a.product_id, a.chemical_amount, a.unit_of_measure_id), 0);
  end if;

  v_have := coalesce(a.inventory_adjusted_qty, 0);
  v_delta := v_desired - v_have;
  if v_delta = 0 then
    return;
  end if;

  begin
    -- One product's stock and remainder move together.
    select quantity_on_hand into v_on_hand
    from public.product_items where id = a.product_id and deleted_at is null
    for update;

    select remainder into v_rem from public.crm_chemical_stock_remainders where product_id = a.product_id;
    v_total := coalesce(v_rem, 0) + v_delta;
    v_step := round(v_total, 2);
    v_short := 0;
    -- Never below zero on hand: the part that isn't in stock isn't accounted, so
    -- the next change to the application retries it (as before).
    if v_step > 0 and v_step > greatest(coalesce(v_on_hand, 0), 0) then
      v_short := v_step - greatest(coalesce(v_on_hand, 0), 0);
      v_step := v_step - v_short;
    end if;

    if v_step <> 0 then
      perform public.adjust_product_item_quantity(
        a.org_id, a.product_id, -v_step,
        case when v_delta > 0 then 'chemical applied on job' else 'chemical application reopened or changed' end
      );
    end if;

    insert into public.crm_chemical_stock_remainders (org_id, product_id, remainder)
    values (a.org_id, a.product_id, v_total - v_short - v_step)
    on conflict (product_id) do update set remainder = excluded.remainder, updated_at = now();

    update public.crm_chemical_applications
    set inventory_adjusted_qty = nullif(v_have + v_delta - v_short, 0)
    where id = a.id;
  exception when others then
    -- Stock bookkeeping must never block the visit/application write that
    -- triggered it (e.g. a service-role call with no end-user for the audit
    -- trail). Nothing above is kept, so the next change retries.
    raise warning 'sync_chemical_application_inventory(%): %', p_app_id, sqlerrm;
  end;
end;
$function$;

-- ── 6. one default rate per product ────────────────────────────────────────
-- Keep the newest default where a product has several.
update public.crm_chemical_application_rates r
set is_default = false
where r.is_default
  and exists (
    select 1 from public.crm_chemical_application_rates r2
    where r2.product_id = r.product_id
      and r2.is_default
      and (r2.created_at, r2.id) > (r.created_at, r.id)
  );
create unique index if not exists crm_chemical_application_rates_one_default
  on public.crm_chemical_application_rates (product_id)
  where is_default;
