-- Crew-login lockdown, part 2 of 2 (bug sweep round 15, area 2). See part 1,
-- 20270109000200, for the rest.
--
--   1. product_items: crew may no longer SELECT the catalog. Its rows carry
--      unit_cost, price, cost_layers and quantity_on_hand, and RLS can't hide
--      columns per role (office and crew share the `authenticated` grants), so
--      the block is by row. The crew app now reads product names / chemical
--      safety fields through crm_crew_product_info() and the product search /
--      requisition / use-materials routes read with the service role after their
--      own org checks.
--   2. crm_services: crew may no longer SELECT the service catalog
--      (default_rate_cents, default_b_cost_cents, target rates, matrix costs).
--      "Suggest work" reads crm_crew_upsell_services(). Crew job service rates
--      keep coming through crm_crew_job_services (NULL when the org hides
--      pricing).
--   3. crm_job_visits: a crew login could change status (cancel / complete /
--      skip), deleted_at, scheduled_date, crew_id, job_id, billing columns… on
--      its own visits straight through PostgREST (the schedule guard exempts
--      crew). The crew app's only direct, user-session visit writes are
--      "acknowledge notes" (acknowledged_notes_at) and the clock-out typed notes
--      (completion_notes); everything else (clock in/out, pause/resume, skip,
--      hand-off, need help, job comments) goes through the service role or a
--      definer RPC. A new BEFORE trigger refuses any other column change by a
--      crew login's direct write. Definer RPCs and the service role are not
--      affected (_crm_direct_user_write() is false for them).
--   4. crm_crew_drive_segments: crew could rewrite its own drive segments'
--      times. The drive start / end / auto-close paths now write with the
--      service role; crew keeps SELECT (the crew page lists today's segments).
--
-- PROD: apply AFTER the code deploy (the old code reads product_items /
-- crm_services, writes visit status on skip and writes drive segments with the
-- crew session). No data changes.
-- PRE-CHECK (informational): crew-visible dashboards built on reports that join
-- the catalog (rpt_products, rpt_services, rpt_chemical_applications' product
-- name, rpt_upsells' service name) will show those values blank to crew:
--   select org_id, name from crm_dashboards where visible_to_crew and deleted_at is null;

-- ── 1. product_items: crew can't read the catalog ────────────────────────────
drop policy if exists crew_no_read_product_items on public.product_items;
create policy crew_no_read_product_items on public.product_items
  as restrictive for select to public
  using (coalesce((select public.my_role()), '') <> 'crew');

-- ── 2. crm_services: crew can't read the service catalog ─────────────────────
drop policy if exists crew_no_read_crm_services on public.crm_services;
create policy crew_no_read_crm_services on public.crm_services
  as restrictive for select to public
  using (coalesce((select public.my_role()), '') <> 'crew');

-- ── 3. crm_job_visits: crew direct writes limited to notes ───────────────────
create or replace function public.crm_job_visits_crew_column_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_changed text;
begin
  -- Office logins, the service role and definer RPCs pass straight through.
  if not public._crm_direct_user_write()
     or coalesce((select public.my_role()), '') <> 'crew' then
    return coalesce(new, old);
  end if;

  if tg_op <> 'UPDATE' then
    raise exception 'A crew login can''t add or remove visits.'
      using errcode = '42501';
  end if;

  select string_agg(n.key, ', ' order by n.key)
    into v_changed
    from jsonb_each(to_jsonb(new)) n
   where n.key not in ('acknowledged_notes_at', 'completion_notes', 'updated_at')
     and n.value is distinct from (to_jsonb(old) -> n.key);

  if v_changed is not null then
    raise exception 'A crew login can only acknowledge notes or add completion notes on a visit directly — use the crew app for everything else (tried to change: %).', v_changed
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Named to sort before every other BEFORE trigger on the table, so it sees
-- exactly what the caller sent (BEFORE triggers fire in name order).
drop trigger if exists a_crm_job_visits_crew_column_guard on public.crm_job_visits;
create trigger a_crm_job_visits_crew_column_guard
  before insert or update or delete on public.crm_job_visits
  for each row execute function public.crm_job_visits_crew_column_guard();

-- ── 4. crm_crew_drive_segments: crew reads, the server writes ────────────────
drop policy if exists crew_role_no_direct_write_ins on public.crm_crew_drive_segments;
create policy crew_role_no_direct_write_ins on public.crm_crew_drive_segments
  as restrictive for insert to public
  with check (coalesce((select public.my_role()), '') <> 'crew');

drop policy if exists crew_role_no_direct_write_upd on public.crm_crew_drive_segments;
create policy crew_role_no_direct_write_upd on public.crm_crew_drive_segments
  as restrictive for update to public
  using (coalesce((select public.my_role()), '') <> 'crew')
  with check (coalesce((select public.my_role()), '') <> 'crew');

drop policy if exists crew_role_no_direct_write_del on public.crm_crew_drive_segments;
create policy crew_role_no_direct_write_del on public.crm_crew_drive_segments
  as restrictive for delete to public
  using (coalesce((select public.my_role()), '') <> 'crew');
