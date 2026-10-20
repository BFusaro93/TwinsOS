-- Chemical confirmation: a preloaded application is only an ESTIMATE until the
-- crew confirms what was actually used.
--
-- Dispatch preloads each service's chemicals onto the visit at the planned
-- amount, saved as "used". If the crew never touched the card, the compliance
-- record and the stock deduction still counted that estimate as applied. Now:
--   * preloaded rows carry confirmed_at / confirmed_by, empty until confirmed
--     (amount entered, or marked Not used);
--   * the compliance view and inventory deduction count only confirmed rows
--     (rows added by hand are not "preloaded" and count as before);
--   * with chemical_settings.confirmation_mode = 'crew_required' (default) a visit
--     can't be completed while a preloaded row is unconfirmed, unless an admin
--     waived it for that visit. 'office_later' turns the gate off for companies
--     whose office enters amounts after the fact.

alter table public.crm_chemical_applications
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid;

alter table public.crm_chemical_settings
  add column if not exists confirmation_mode text not null default 'crew_required';
alter table public.crm_chemical_settings
  drop constraint if exists crm_chemical_settings_confirmation_mode_check;
alter table public.crm_chemical_settings
  add constraint crm_chemical_settings_confirmation_mode_check
  check (confirmation_mode in ('crew_required', 'office_later'));

alter table public.crm_job_visits
  add column if not exists chemical_confirmation_waived_at timestamptz,
  add column if not exists chemical_confirmation_waived_by uuid;

-- Inventory: unconfirmed preloaded rows draw nothing down; confirming (or
-- editing) after the visit is done does.
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

  if a.deleted_at is null and a.used and v_status = 'completed' and coalesce(v_inventory, false)
     and (not a.preloaded or a.confirmed_at is not null) then
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


drop trigger if exists trg_crm_chemical_applications_inventory on public.crm_chemical_applications;
create trigger trg_crm_chemical_applications_inventory
  after insert or update of used, chemical_amount, unit_of_measure_id, deleted_at, visit_id, confirmed_at
  on public.crm_chemical_applications
  for each row execute function public.trg_chemical_application_inventory();

-- Compliance report: only confirmed preloaded rows (location logic from
-- 20261023120000 unchanged).
create or replace view public.rpt_chemical_applications with (security_invoker = on) as
 SELECT ca.id,
    COALESCE(((ca.application_start_time AT TIME ZONE org_timezone(ca.org_id)))::date, v.scheduled_date, j.scheduled_date) AS service_date,
    c.display_name AS client_name,
    CASE addr.src WHEN 1 THEN j.service_address WHEN 2 THEN cp.address WHEN 3 THEN c.service_address ELSE c.billing_address END AS service_address,
    CASE addr.src WHEN 1 THEN j.service_city WHEN 2 THEN cp.city WHEN 3 THEN c.service_city ELSE c.billing_city END AS service_city,
    CASE addr.src WHEN 1 THEN j.service_state WHEN 2 THEN cp.state WHEN 3 THEN c.service_state ELSE c.billing_state END AS service_state,
    CASE addr.src WHEN 1 THEN j.service_zip WHEN 2 THEN cp.zip WHEN 3 THEN c.service_zip ELSE c.billing_zip END AS service_zip,
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
          WHERE (li.id = ANY (ca.areas_treated_ids))) AS areas_treated,
    NULLIF(concat_ws(', '::text, NULLIF(CASE addr.src WHEN 1 THEN j.service_address WHEN 2 THEN cp.address WHEN 3 THEN c.service_address ELSE c.billing_address END, ''::text), NULLIF(CASE addr.src WHEN 1 THEN j.service_city WHEN 2 THEN cp.city WHEN 3 THEN c.service_city ELSE c.billing_city END, ''::text)), ''::text) AS service_location,
        CASE
            WHEN (ca.chemical_amount IS NULL) THEN NULL::text
            ELSE concat_ws(' '::text, regexp_replace(regexp_replace((ca.chemical_amount)::text, '(\.[0-9]*?)0+$'::text, '\1'::text), '\.$'::text, ''::text), uom.name)
        END AS chemical_applied,
        CASE
            WHEN (ca.solution_amount IS NULL) THEN NULL::text
            ELSE concat_ws(' '::text, regexp_replace(regexp_replace((ca.solution_amount)::text, '(\.[0-9]*?)0+$'::text, '\1'::text), '\.$'::text, ''::text), solution_uom.name)
        END AS solution_applied,
    NULLIF(concat_ws(' · '::text,
        CASE
            WHEN (ca.temperature IS NOT NULL) THEN (regexp_replace(regexp_replace((ca.temperature)::text, '(\.[0-9]*?)0+$'::text, '\1'::text), '\.$'::text, ''::text) || '°F'::text)
            ELSE NULL::text
        END,
        CASE
            WHEN ((ca.wind_speed IS NOT NULL) OR (NULLIF(ca.wind_direction, ''::text) IS NOT NULL)) THEN ('wind '::text || concat_ws(' '::text, regexp_replace(regexp_replace((ca.wind_speed)::text, '(\.[0-9]*?)0+$'::text, '\1'::text), '\.$'::text, ''::text), NULLIF(ca.wind_direction, ''::text)))
            ELSE NULL::text
        END,
        CASE
            WHEN (ca.ph_level IS NOT NULL) THEN ('pH '::text || regexp_replace(regexp_replace((ca.ph_level)::text, '(\.[0-9]*?)0+$'::text, '\1'::text), '\.$'::text, ''::text))
            ELSE NULL::text
        END), ''::text) AS conditions,
    NULLIF(concat_ws(' '::text, NULLIF(TRIM(BOTH FROM ((COALESCE(e.first_name, ''::text) || ' '::text) || COALESCE(e.last_name, ''::text))), ''::text),
        CASE
            WHEN (ca.applicator_license_number IS NOT NULL) THEN (('(Lic. '::text || ca.applicator_license_number) || ')'::text)
            ELSE NULL::text
        END), ''::text) AS applicator,
        CASE
            WHEN (ca.application_start_time IS NULL) THEN NULL::text
            ELSE (to_char((ca.application_start_time AT TIME ZONE org_timezone(ca.org_id)), 'HH12:MI AM'::text) || COALESCE((' – '::text || to_char((ca.application_end_time AT TIME ZONE org_timezone(ca.org_id)), 'HH12:MI AM'::text)), ''::text))
        END AS application_window
   FROM ((((((((((crm_chemical_applications ca
     JOIN crm_jobs j ON (((j.id = ca.job_id) AND (j.deleted_at IS NULL))))
     LEFT JOIN crm_job_visits v ON (((v.id = ca.visit_id) AND (v.deleted_at IS NULL))))
     JOIN clients c ON (((c.id = j.client_id) AND (c.deleted_at IS NULL))))
     LEFT JOIN client_properties cp ON (((cp.id = j.property_id) AND (cp.deleted_at IS NULL))))
     CROSS JOIN LATERAL ( SELECT CASE WHEN (NULLIF(btrim(j.service_address), ''::text) IS NOT NULL) THEN 1 WHEN (NULLIF(btrim(cp.address), ''::text) IS NOT NULL) THEN 2 WHEN (NULLIF(btrim(c.service_address), ''::text) IS NOT NULL) THEN 3 ELSE 4 END AS src) addr)
     LEFT JOIN product_items p ON ((p.id = ca.product_id)))
     LEFT JOIN crm_chemical_lookup_items uom ON ((uom.id = ca.unit_of_measure_id)))
     LEFT JOIN crm_chemical_lookup_items solution_uom ON ((solution_uom.id = ca.solution_unit_of_measure_id)))
     LEFT JOIN crm_chemical_lookup_items meth ON ((meth.id = ca.application_method_id)))
     LEFT JOIN crm_employees e ON ((e.id = ca.applicator_employee_id)))
  WHERE ((ca.deleted_at IS NULL) AND ((NOT ca.preloaded) OR (ca.confirmed_at IS NOT NULL)) AND ((ca.visit_id IS NULL) OR (v.status = ANY (ARRAY['in_progress'::text, 'completed'::text]))));


-- Completion gate.
create or replace function public.trg_chemical_confirmation_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_names text;
begin
  if new.status is distinct from 'completed' or old.status = 'completed' then
    return new;
  end if;
  if new.chemical_confirmation_waived_at is not null then
    return new;
  end if;

  select confirmation_mode into v_mode from public.crm_chemical_settings where org_id = new.org_id limit 1;
  if coalesce(v_mode, 'crew_required') <> 'crew_required' then
    return new;
  end if;

  select string_agg(coalesce(p.name, 'a chemical'), ', ' order by p.name) into v_names
  from public.crm_chemical_applications ca
  left join public.product_items p on p.id = ca.product_id
  where ca.visit_id = new.id
    and ca.deleted_at is null
    and ca.preloaded
    and ca.confirmed_at is null;

  if v_names is not null then
    raise exception 'chemical_confirmation_required: confirm the amount used (or mark Not used) for % before completing this visit', v_names
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_job_visits_chemical_confirmation_gate on public.crm_job_visits;
create trigger trg_crm_job_visits_chemical_confirmation_gate
  before update of status on public.crm_job_visits
  for each row execute function public.trg_chemical_confirmation_gate();

-- Admin override for one visit: complete it without confirming. The rows stay
-- unconfirmed, so they are not reported or deducted until someone confirms them.
create or replace function public.waive_chemical_confirmation(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
  update public.crm_job_visits
  set chemical_confirmation_waived_at = now(),
      chemical_confirmation_waived_by = auth.uid()
  where id = p_visit_id;
end;
$$;

revoke all on function public.waive_chemical_confirmation(uuid) from public, anon;
grant execute on function public.waive_chemical_confirmation(uuid) to authenticated;
