-- Multi-crew visits: two (or more) crews work the same stop on the same day.
--
-- Model: a "crew group" is a set of sibling crm_job_visits rows that share
-- crew_group_id — ONE visit per crew. Exactly one member is the LEAD
-- (crew_group_secondary = false, the original visit); the rest are SECONDARY
-- (crew_group_secondary = true). Because every crew gets a real visit of its
-- own, everything that is per-visit today keeps working untouched: the
-- dispatch-board column, the crew app stop, RLS ("crew reads own crew
-- visits"), clock in/out, breaks, punches (crm_crew_member_times anchor on the
-- visit), actual_hours / men_count / labor cost, chemical and photo records.
--
-- What "one stop" means is therefore enforced where money and counts are made:
--   * REVENUE / BILLING / "visit counts" belong to the LEAD only. Secondary
--     visits report 0 revenue (rpt_job_visits, rpt_job_services line revenue),
--     never auto-invoice (complete-visit-side-effects.ts) and never count as a
--     contract visit used (rpt_contract_service_usage).
--   * LABOR is the sum of the siblings' own hours/labor, which every rollup
--     already does (rpt_job_visits per row, crm_recompute_job_actual_hours,
--     crm_job_visits_rollup_job_labor, rpt_job_services per row).
--   * BUDGETED hours are split evenly across the group's live members in
--     rpt_job_visits so the group's variance isn't charged the full budget once
--     per crew.
--
-- A crew group is created and edited ONLY through crm_add_visit_crew /
-- crm_remove_visit_crew below (office users; crew logins have no INSERT).

-- ── columns ──────────────────────────────────────────────────────────────────
alter table public.crm_job_visits
  add column if not exists crew_group_id uuid,
  add column if not exists crew_group_secondary boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_job_visits_crew_group_secondary_chk') then
    alter table public.crm_job_visits
      add constraint crm_job_visits_crew_group_secondary_chk
      check (not crew_group_secondary or crew_group_id is not null);
  end if;
end $$;

create index if not exists crm_job_visits_crew_group_idx
  on public.crm_job_visits (crew_group_id) where crew_group_id is not null;

-- One lead per group, and one visit per crew per group.
create unique index if not exists crm_job_visits_crew_group_lead_unique
  on public.crm_job_visits (crew_group_id)
  where crew_group_id is not null and not crew_group_secondary and deleted_at is null;
create unique index if not exists crm_job_visits_crew_group_crew_unique
  on public.crm_job_visits (crew_group_id, crew_id)
  where crew_group_id is not null and crew_id is not null and deleted_at is null;

-- ── keep the group together ──────────────────────────────────────────────────

-- Rescheduling any member moves the siblings that haven't started. A sibling
-- already clocked in / finished stays where the work actually happened.
create or replace function public.crm_job_visits_group_follow_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return null; -- a sibling's own cascaded update
  end if;
  update crm_job_visits s
     set scheduled_date = new.scheduled_date
   where s.crew_group_id = new.crew_group_id
     and s.id <> new.id
     and s.deleted_at is null
     and s.status in ('scheduled', 'dispatched')
     and s.clocked_in_at is null
     and s.scheduled_date is distinct from new.scheduled_date;
  return null;
end;
$$;
revoke execute on function public.crm_job_visits_group_follow_date() from public, anon, authenticated;

drop trigger if exists trg_crm_job_visits_group_follow_date on public.crm_job_visits;
create trigger trg_crm_job_visits_group_follow_date
  after update of scheduled_date on public.crm_job_visits
  for each row
  when (new.crew_group_id is not null and old.scheduled_date is distinct from new.scheduled_date)
  execute function public.crm_job_visits_group_follow_date();

-- A lead that is deleted (or pruned with the job's schedule) hands billing to
-- the oldest remaining sibling, so a stop never ends up with no lead.
create or replace function public.crm_job_visits_group_lead_failover()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update crm_job_visits s
     set crew_group_secondary = false
   where s.id = (
     select g.id from crm_job_visits g
      where g.crew_group_id = new.crew_group_id
        and g.id <> new.id
        and g.deleted_at is null
      order by g.created_at, g.id
      limit 1
   );
  return null;
end;
$$;
revoke execute on function public.crm_job_visits_group_lead_failover() from public, anon, authenticated;

drop trigger if exists trg_crm_job_visits_group_lead_failover on public.crm_job_visits;
create trigger trg_crm_job_visits_group_lead_failover
  after update of deleted_at on public.crm_job_visits
  for each row
  when (new.crew_group_id is not null
        and not new.crew_group_secondary
        and old.deleted_at is null
        and new.deleted_at is not null)
  execute function public.crm_job_visits_group_lead_failover();

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Adds p_crew_id to the visit's stop: creates a secondary sibling visit for
-- that crew (same job/service/date/times/notes, fresh clock state) and, the
-- first time, stamps the original visit's effective crew onto it explicitly.
-- p_visit_id may be any member of an existing group. Returns the new visit id.
create or replace function public.crm_add_visit_crew(p_visit_id uuid, p_crew_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_org     uuid := my_org_id();
  v_pick    crm_job_visits%rowtype;
  v_lead    crm_job_visits%rowtype;
  v_job     crm_jobs%rowtype;
  v_gid     uuid;
  v_eff     uuid;
  v_new     uuid := gen_random_uuid();
begin
  if v_org is null then
    raise exception 'crm_add_visit_crew: no org for current user';
  end if;

  select * into v_pick from crm_job_visits
   where id = p_visit_id and org_id = v_org and deleted_at is null;
  if not found then
    raise exception 'Visit not found';
  end if;

  -- Always clone from the group's lead.
  if v_pick.crew_group_id is not null then
    select * into v_lead from crm_job_visits
     where crew_group_id = v_pick.crew_group_id and not crew_group_secondary and deleted_at is null
     limit 1;
  end if;
  if not found or v_lead.id is null then
    v_lead := v_pick;
  end if;

  select * into v_job from crm_jobs where id = v_lead.job_id and org_id = v_org and deleted_at is null;
  if not found then
    raise exception 'Job not found';
  end if;
  if v_job.job_type = 'snow' or v_lead.storm_event_id is not null then
    raise exception 'Snow visits are billed and staffed per storm — extra crews are not supported there.';
  end if;
  if v_lead.status not in ('scheduled', 'dispatched') or v_lead.clocked_in_at is not null then
    raise exception 'Another crew can only be added before the stop has started.';
  end if;

  perform 1 from crm_crews where id = p_crew_id and org_id = v_org and deleted_at is null;
  if not found then
    raise exception 'Crew not found';
  end if;

  v_eff := case when v_lead.crew_unassigned then null else coalesce(v_lead.crew_id, v_job.crew_id) end;
  if v_eff is null then
    raise exception 'Assign a crew to this visit first, then add the second crew.';
  end if;

  v_gid := coalesce(v_lead.crew_group_id, gen_random_uuid());

  if v_eff = p_crew_id or exists (
    select 1 from crm_job_visits g
     where g.crew_group_id = v_gid and g.crew_id = p_crew_id and g.deleted_at is null
  ) then
    raise exception 'That crew is already on this stop.';
  end if;

  if v_lead.crew_group_id is null then
    update crm_job_visits
       set crew_group_id = v_gid,
           crew_id = v_eff,
           crew_unassigned = false
     where id = v_lead.id;
  end if;

  insert into crm_job_visits
  select (jsonb_populate_record(
    null::crm_job_visits,
    to_jsonb(v_lead) || jsonb_build_object(
      'id', v_new,
      'crew_id', p_crew_id,
      'crew_unassigned', false,
      'crew_group_id', v_gid,
      'crew_group_secondary', true,
      'status', v_lead.status,
      'dispatched_at', case when v_lead.status = 'dispatched' then v_lead.dispatched_at end,
      'completed_at', null,
      'clocked_in_at', null,
      'clocked_out_at', null,
      'paused_at', null,
      'break_minutes', 0,
      'break_paid', null,
      'actual_hours', null,
      'actual_labor_cost_cents', 0,
      'acknowledged_notes_at', null,
      'skip_reason', null,
      'sub_status', null,
      'completion_notes', null,
      'occurrence_date', null,
      'materials_used', '[]'::jsonb,
      'job_comments', '[]'::jsonb,
      'chemical_confirmation_waived_at', null,
      'chemical_confirmation_waived_by', null,
      'created_at', now(),
      'updated_at', now(),
      'created_by', auth.uid()
    )
  )).*;

  return v_new;
end;
$$;
revoke execute on function public.crm_add_visit_crew(uuid, uuid) from public, anon;
grant execute on function public.crm_add_visit_crew(uuid, uuid) to authenticated;

-- Takes a crew back off the stop (soft-deletes its sibling visit). Only before
-- that crew has started. Removing the lead hands the lead role to a sibling
-- (trigger above); a group left with a single visit is dissolved.
create or replace function public.crm_remove_visit_crew(p_visit_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_org  uuid := my_org_id();
  v      crm_job_visits%rowtype;
  v_left integer;
begin
  if v_org is null then
    raise exception 'crm_remove_visit_crew: no org for current user';
  end if;
  select * into v from crm_job_visits
   where id = p_visit_id and org_id = v_org and deleted_at is null;
  if not found or v.crew_group_id is null then
    raise exception 'This visit does not have multiple crews.';
  end if;
  if v.status not in ('scheduled', 'dispatched') or v.clocked_in_at is not null then
    raise exception 'That crew has already started — it can''t be removed from the stop.';
  end if;

  update crm_job_visits set deleted_at = now() where id = v.id;

  select count(*) into v_left from crm_job_visits
   where crew_group_id = v.crew_group_id and deleted_at is null;
  if v_left <= 1 then
    update crm_job_visits
       set crew_group_id = null, crew_group_secondary = false
     where crew_group_id = v.crew_group_id and deleted_at is null;
  end if;
end;
$$;
revoke execute on function public.crm_remove_visit_crew(uuid) from public, anon;
grant execute on function public.crm_remove_visit_crew(uuid) to authenticated;

-- ── reports ──────────────────────────────────────────────────────────────────
-- Patched in place from each environment's live definition (so nothing a later
-- migration changed is lost to a stale copy); every patch asserts it applied
-- and is a no-op once crew_group is already referenced.
do $$
declare
  def text;
  newdef text;
  s_rev text := 'CASE WHEN v.crew_group_secondary THEN 0 ELSE calc.revenue_cents END';
  s_bud text := 'COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours)';
begin
  -- rpt_job_visits ----------------------------------------------------------
  def := pg_get_viewdef('public.rpt_job_visits'::regclass, true);
  if def !~ 'crew_group' then
    newdef := regexp_replace(def,
      'calc\.revenue_cents,(\s+labor\.labor_cost_cents AS actual_labor_cost_cents)',
      s_rev || ' AS revenue_cents,\1');
    if newdef = def then raise exception 'multi-crew patch: revenue column not found in rpt_job_visits'; end if;
    def := newdef;

    newdef := replace(def, 'calc.revenue_cents::numeric', '(' || s_rev || ')::numeric');
    if newdef = def then raise exception 'multi-crew patch: per-hour revenue not found in rpt_job_visits'; end if;
    def := newdef;

    newdef := replace(def, s_bud, '(' || s_bud || ' / grp.n)');
    if newdef = def then raise exception 'multi-crew patch: budgeted hours not found in rpt_job_visits'; end if;
    def := newdef;

    newdef := regexp_replace(def, 'AS actual_stop_time(\s+FROM crm_job_visits v)',
      'AS actual_stop_time, v.crew_group_id, v.crew_group_secondary\1');
    if newdef = def then raise exception 'multi-crew patch: column tail not found in rpt_job_visits'; end if;
    def := newdef;

    newdef := regexp_replace(def, '\s+WHERE v\.deleted_at IS NULL\s*;?\s*$',
      E'\n CROSS JOIN LATERAL ( SELECT CASE WHEN v.crew_group_id IS NULL THEN 1::numeric ELSE GREATEST(1::numeric, ( SELECT count(*) FROM crm_job_visits g WHERE g.crew_group_id = v.crew_group_id AND g.deleted_at IS NULL AND g.status <> ''cancelled'' )::numeric) END AS n) grp\n WHERE v.deleted_at IS NULL');
    if newdef = def then raise exception 'multi-crew patch: WHERE tail not found in rpt_job_visits'; end if;

    execute 'create or replace view public.rpt_job_visits with (security_invoker = on) as ' || newdef;
  end if;

  -- rpt_job_services --------------------------------------------------------
  def := pg_get_viewdef('public.rpt_job_services'::regclass, true);
  if def !~ 'crew_group' then
    -- service-line revenue belongs to the lead only
    newdef := regexp_replace(def,
      '(CASE\s+WHEN COALESCE\(jsv\.included, true\) THEN round\(.*?END) AS line_revenue_cents',
      'CASE WHEN v.crew_group_secondary THEN 0 ELSE \1 END AS line_revenue_cents');
    if newdef = def then raise exception 'multi-crew patch: line revenue not found in rpt_job_services'; end if;
    def := newdef;

    -- production rate (qty / hours): the lead's qty was done by ALL crews, so
    -- divide by the group's combined hours; secondaries report none
    newdef := replace(def, '(calc.actual_hours * shr.share)', '(pr.hours * shr.share)');
    if newdef = def then raise exception 'multi-crew patch: production rate not found in rpt_job_services'; end if;
    def := newdef;

    newdef := regexp_replace(def, '\s+WHERE v\.deleted_at IS NULL\s*;?\s*$',
      E'\n CROSS JOIN LATERAL ( SELECT CASE WHEN v.crew_group_secondary THEN NULL::numeric WHEN v.crew_group_id IS NULL THEN calc.actual_hours ELSE ( SELECT CASE WHEN bool_or(g.actual_hours IS NULL) THEN NULL ELSE sum(g.actual_hours) END FROM crm_job_visits g WHERE g.crew_group_id = v.crew_group_id AND g.deleted_at IS NULL AND g.status NOT IN (''cancelled'', ''skipped'') ) END AS hours) pr\n WHERE v.deleted_at IS NULL');
    if newdef = def then raise exception 'multi-crew patch: WHERE tail not found in rpt_job_services'; end if;

    execute 'create or replace view public.rpt_job_services with (security_invoker = on) as ' || newdef;
  end if;

  -- rpt_contract_service_usage ---------------------------------------------
  def := pg_get_viewdef('public.rpt_contract_service_usage'::regclass, true);
  if def !~ 'crew_group' then
    newdef := replace(def, 'AND v.deleted_at IS NULL AND (cs.service_id',
                      'AND v.deleted_at IS NULL AND NOT v.crew_group_secondary AND (cs.service_id');
    if newdef = def then raise exception 'multi-crew patch: usage filter not found in rpt_contract_service_usage'; end if;
    execute 'create or replace view public.rpt_contract_service_usage with (security_invoker = on) as '
            || regexp_replace(newdef, ';\s*$', '');
  end if;
end $$;

-- ── crew app: who else is on my stop ─────────────────────────────────────────
-- A crew login can only read its OWN crew's visits (RLS), so it cannot look up
-- the sibling visit to learn the other crew's name. This returns just the other
-- crews' names for visits the caller may see — a crew login only for its own
-- crew's visits, office users for any visit in their org.
create or replace function public.crm_visit_crew_partners(p_visit_ids uuid[])
returns table (visit_id uuid, crew_id uuid, crew_name text)
language sql
stable
security definer
set search_path = public
as $$
  select me.id, sib.crew_id, c.name
    from crm_job_visits me
    join crm_job_visits sib
      on sib.crew_group_id = me.crew_group_id
     and sib.id <> me.id
     and sib.deleted_at is null
     and sib.org_id = me.org_id
    join crm_crews c on c.id = sib.crew_id and c.deleted_at is null
   where me.id = any(p_visit_ids)
     and me.org_id = my_org_id()
     and me.crew_group_id is not null
     and me.deleted_at is null
     and (coalesce(my_role(), '') <> 'crew' or me.crew_id in (select my_crew_ids()))
   order by c.name;
$$;
revoke execute on function public.crm_visit_crew_partners(uuid[]) from public, anon;
grant execute on function public.crm_visit_crew_partners(uuid[]) to authenticated;
