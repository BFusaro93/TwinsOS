-- Chemical tracking readiness:
--   1. Completed chemical applications now draw down the product's stock.
--   2. The Chemical Tracking (compliance) report only lists applications whose
--      visit is actually underway or finished.
--   3. Default Chemical Quantity is on for new orgs.

-- ── 1. inventory depletion ───────────────────────────────────────────────────
--
-- Nothing took a completed chemical application out of product_items stock
-- (general job materials do, via set_job_product_status), so on-hand only ever
-- went up and the Materials Needed shortfall drifted further from reality with
-- every job. A used application on a COMPLETED visit now deducts its concentrate
-- amount, converted into the product's stock unit (the unit of its default
-- application rate — the same convention Materials Needed reads it in).
--
-- inventory_adjusted_qty is how much this row has already taken out, so every
-- change is a delta against it: editing the amount, un-marking "Used", deleting
-- the row, or reopening the visit puts stock back, and re-saving does nothing.
-- A deduction is clamped to what is on hand rather than refusing — completing a
-- job must never be blocked by a stock count being behind.

alter table public.crm_chemical_applications
  add column if not exists inventory_adjusted_qty numeric;

-- Concentrate amount restated in the product's stock unit; null when it can't be
-- done honestly (no default rate, unconvertible or cross-class units).
create or replace function public.chem_amount_in_stock_unit(p_product_id uuid, p_amount numeric, p_unit_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_stock_unit uuid;
  v_from record;
  v_to record;
begin
  if p_amount is null or p_unit_id is null then
    return null;
  end if;

  select unit_of_measure_id into v_stock_unit
  from public.crm_chemical_application_rates
  where product_id = p_product_id and unit_of_measure_id is not null
  order by is_default desc, created_at
  limit 1;
  if v_stock_unit is null then
    return null;
  end if;
  if v_stock_unit = p_unit_id then
    return p_amount;
  end if;

  select unit_class, base_factor into v_from from public.crm_chemical_lookup_items where id = p_unit_id;
  select unit_class, base_factor into v_to from public.crm_chemical_lookup_items where id = v_stock_unit;
  if v_from.unit_class is null or v_to.unit_class is null
     or v_from.unit_class <> v_to.unit_class
     or v_from.base_factor is null or v_to.base_factor is null
     or v_to.base_factor = 0 then
    return null;
  end if;
  return p_amount * v_from.base_factor / v_to.base_factor;
end;
$$;

create or replace function public.sync_chemical_application_inventory(p_app_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.crm_chemical_applications%rowtype;
  v_status text;
  v_inventory boolean;
  v_on_hand numeric;
  v_desired numeric := 0;
  v_have numeric;
  v_delta numeric;
  v_apply numeric;
begin
  select * into a from public.crm_chemical_applications where id = p_app_id;
  if not found then
    return;
  end if;

  select status into v_status from public.crm_job_visits where id = a.visit_id and deleted_at is null;
  select is_inventory, quantity_on_hand into v_inventory, v_on_hand
  from public.product_items where id = a.product_id and deleted_at is null;

  if a.deleted_at is null and a.used and v_status = 'completed' and coalesce(v_inventory, false) then
    v_desired := coalesce(round(public.chem_amount_in_stock_unit(a.product_id, a.chemical_amount, a.unit_of_measure_id), 2), 0);
  end if;

  v_have := coalesce(a.inventory_adjusted_qty, 0);
  v_delta := v_desired - v_have;
  if v_delta = 0 then
    return;
  end if;

  begin
    if v_delta > 0 then
      v_apply := least(v_delta, coalesce(v_on_hand, 0));
      if v_apply <= 0 then
        return;
      end if;
      perform public.adjust_product_item_quantity(a.org_id, a.product_id, -v_apply, 'chemical applied on job');
      update public.crm_chemical_applications
      set inventory_adjusted_qty = v_have + v_apply
      where id = a.id;
    else
      perform public.adjust_product_item_quantity(a.org_id, a.product_id, -v_delta, 'chemical application reopened or changed');
      update public.crm_chemical_applications
      set inventory_adjusted_qty = nullif(v_desired, 0)
      where id = a.id;
    end if;
  exception when others then
    -- Stock bookkeeping must never block the visit/application write that
    -- triggered it (e.g. a service-role call with no end-user for the audit
    -- trail). inventory_adjusted_qty is untouched, so the next change retries.
    raise warning 'sync_chemical_application_inventory(%): %', p_app_id, sqlerrm;
  end;
end;
$$;

create or replace function public.trg_chemical_application_inventory()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_chemical_application_inventory(new.id);
  return null;
end;
$$;

-- product_id is deliberately not in the column list: a row never changes product,
-- and the stock already taken is booked against the product it was taken from.
drop trigger if exists trg_crm_chemical_applications_inventory on public.crm_chemical_applications;
create trigger trg_crm_chemical_applications_inventory
  after insert or update of used, chemical_amount, unit_of_measure_id, deleted_at, visit_id
  on public.crm_chemical_applications
  for each row execute function public.trg_chemical_application_inventory();

create or replace function public.trg_chemical_visit_inventory()
returns trigger
language plpgsql
as $$
declare
  r record;
begin
  for r in
    select id from public.crm_chemical_applications where visit_id = new.id
  loop
    perform public.sync_chemical_application_inventory(r.id);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_crm_job_visits_chemical_inventory on public.crm_job_visits;
create trigger trg_crm_job_visits_chemical_inventory
  after update of status, deleted_at on public.crm_job_visits
  for each row
  when (old.status is distinct from new.status or old.deleted_at is distinct from new.deleted_at)
  execute function public.trg_chemical_visit_inventory();

-- History is already reflected in on-hand counts: mark every used application on
-- a completed visit as accounted for WITHOUT touching stock, so only changes made
-- from here on move inventory (otherwise editing an old record would deduct the
-- whole amount a second time).
update public.crm_chemical_applications ca
set inventory_adjusted_qty = round(public.chem_amount_in_stock_unit(ca.product_id, ca.chemical_amount, ca.unit_of_measure_id), 2)
from public.crm_job_visits v, public.product_items p
where v.id = ca.visit_id
  and p.id = ca.product_id
  and v.status = 'completed'
  and ca.used
  and ca.deleted_at is null
  and p.is_inventory
  and ca.inventory_adjusted_qty is null
  and public.chem_amount_in_stock_unit(ca.product_id, ca.chemical_amount, ca.unit_of_measure_id) is not null;

-- ── 2. compliance report: only applications that have actually happened ──────
--
-- Application rows exist from the moment a chemical is attached to a visit, and
-- `used` defaults to true, so the report listed a lawn as sprayed days before
-- the crew got there — and kept listing one whose visit was later cancelled or
-- skipped. Applications tied to a visit now count once that visit is in
-- progress or completed; ones logged straight against a job (no visit) are
-- unchanged. Body = 20261016060000 with only the visit-status condition added;
-- columns identical -> CREATE OR REPLACE.

create or replace view public.rpt_chemical_applications with (security_invoker = on) as
 SELECT ca.id,
    COALESCE(((ca.application_start_time AT TIME ZONE public.org_timezone(ca.org_id)))::date, v.scheduled_date, j.scheduled_date) AS service_date,
    c.display_name AS client_name,
    COALESCE(j.service_address, c.service_address) AS service_address,
    COALESCE(j.service_city, c.service_city) AS service_city,
    COALESCE(j.service_state, c.service_state) AS service_state,
    COALESCE(j.service_zip, c.service_zip) AS service_zip,
    p.name AS chemical_name,
    COALESCE(ca.epa_number_snapshot, p.epa_registration_number) AS epa_registration_number,
    ca.epa_number_snapshot,
    COALESCE(ca.re_entry_interval_snapshot, p.re_entry_interval) AS re_entry_interval,
    COALESCE(ca.restricted_product_snapshot, p.restricted_product) AS restricted_product,
    ca.chemical_amount,
    ca.solution_amount,
    uom.name AS unit_of_measure,
    solution_uom.name AS solution_unit_of_measure,
    ca.application_rate_label,
    meth.name AS application_method,
    ca.temperature,
    ca.wind_speed,
    ca.wind_direction,
    ca.ph_level,
    ca.used,
    TRIM(BOTH FROM ((COALESCE(e.first_name, ''::text) || ' '::text) || COALESCE(e.last_name, ''::text))) AS applicator_name,
    ca.applicator_license_number,
    ca.application_start_time,
    ca.application_end_time,
    ca.budgeted_concentrate_amount,
    ca.notes,
    ( SELECT string_agg(li.name, ', '::text ORDER BY li.name) AS string_agg
           FROM crm_chemical_lookup_items li
          WHERE (li.id = ANY (ca.target_ids))) AS targets,
    ( SELECT string_agg(li.name, ', '::text ORDER BY li.name) AS string_agg
           FROM crm_chemical_lookup_items li
          WHERE (li.id = ANY (ca.areas_treated_ids))) AS areas_treated
   FROM ((((((((crm_chemical_applications ca
     JOIN crm_jobs j ON (((j.id = ca.job_id) AND (j.deleted_at IS NULL))))
     LEFT JOIN crm_job_visits v ON (((v.id = ca.visit_id) AND (v.deleted_at IS NULL))))
     JOIN clients c ON (((c.id = j.client_id) AND (c.deleted_at IS NULL))))
     LEFT JOIN product_items p ON ((p.id = ca.product_id)))
     LEFT JOIN crm_chemical_lookup_items uom ON ((uom.id = ca.unit_of_measure_id)))
     LEFT JOIN crm_chemical_lookup_items solution_uom ON ((solution_uom.id = ca.solution_unit_of_measure_id)))
     LEFT JOIN crm_chemical_lookup_items meth ON ((meth.id = ca.application_method_id)))
     LEFT JOIN crm_employees e ON ((e.id = ca.applicator_employee_id)))
  WHERE (ca.deleted_at IS NULL)
    AND (ca.visit_id IS NULL OR v.status IN ('in_progress', 'completed'));

-- ── 3. Default Chemical Quantity on for new orgs ─────────────────────────────
-- An org that has set a rate and an Area Custom Field expects the estimate to
-- fill in; leaving the switch off by default produced blank amounts everywhere
-- until someone found it. Existing orgs keep whatever they chose.
alter table public.crm_chemical_settings alter column auto_calc_quantity set default true;

-- SECURITY DEFINER helpers are internal; the trigger runs them, clients never should.
revoke execute on function public.chem_amount_in_stock_unit(uuid, numeric, uuid) from public, anon;
revoke execute on function public.sync_chemical_application_inventory(uuid) from public, anon;
