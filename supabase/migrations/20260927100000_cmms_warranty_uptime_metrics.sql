-- CMMS: asset warranties, uptime tracking, PM compliance, and per-asset
-- reliability / cost metrics.
--
--   1. Warranty columns on assets AND vehicles (vehicles are assets with a
--      different UX — see initial_schema SECTION 8 — and share the Asset type).
--   2. work_orders.completed_at, stamped by trigger. There was no record of
--      WHEN a work order was finished, which PM compliance (on time vs late)
--      and "cost in the last 12 months" both need. Backfilled from the audit
--      trail's status_changed → done entries, falling back to updated_at.
--   3. asset_status_history — one row per status period for every asset and
--      vehicle, written by trigger. Uptime is measured from it. Backfilled
--      from the audit trail's status_changed entries.
--   4. v_pm_work_order_outcomes — the single definition of how a PM work
--      order counts toward compliance. The Reports page and the per-asset
--      RPC both read it, so the two can never disagree.
--   5. cmms_asset_metrics(window_days, asset_id) — uptime, downtime, MTTR,
--      12-month and lifetime maintenance cost, PM compliance, per asset.

-- ── 1. Warranty ─────────────────────────────────────────────────────────────
-- warranty_end_date is the source of truth every report reads. The start date
-- and term are kept so a warranty entered as a period ("36 months from
-- purchase") can be shown and edited as one; the form derives the end date.

alter table public.assets
  add column if not exists warranty_start_date  date,
  add column if not exists warranty_term_months smallint,
  add column if not exists warranty_end_date    date,
  add column if not exists warranty_notes       text;

alter table public.vehicles
  add column if not exists warranty_start_date  date,
  add column if not exists warranty_term_months smallint,
  add column if not exists warranty_end_date    date,
  add column if not exists warranty_notes       text;

do $$
declare t text;
begin
  foreach t in array array['assets', 'vehicles'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_warranty_term_months_check') then
      execute format(
        'alter table public.%I add constraint %I check (warranty_term_months is null or warranty_term_months between 1 and 600)',
        t, t || '_warranty_term_months_check');
    end if;
    if not exists (select 1 from pg_constraint where conname = t || '_warranty_dates_check') then
      execute format(
        'alter table public.%I add constraint %I check (warranty_end_date is null or warranty_start_date is null or warranty_end_date >= warranty_start_date)',
        t, t || '_warranty_dates_check');
    end if;
  end loop;
end $$;

create index if not exists assets_warranty_end_date_idx
  on public.assets (org_id, warranty_end_date)
  where deleted_at is null and warranty_end_date is not null;
create index if not exists vehicles_warranty_end_date_idx
  on public.vehicles (org_id, warranty_end_date)
  where deleted_at is null and warranty_end_date is not null;

-- ── 2. work_orders.completed_at ─────────────────────────────────────────────

alter table public.work_orders
  add column if not exists completed_at timestamptz;

-- Backfill before the trigger exists. The UPDATE touches no status, but the
-- updated_at trigger would stamp every done WO with today (destroying the
-- fallback this backfill itself relies on) and the audit trigger would write
-- a thousand "completed at: blank → …" entries, so both are paused for it.
alter table public.work_orders disable trigger trg_audit_work_orders;
alter table public.work_orders disable trigger trg_work_orders_updated_at;

update public.work_orders w
   set completed_at = coalesce(
         (select max(a.created_at)
            from public.audit_log a
           where a.record_type = 'work_order'
             and a.record_id = w.id
             and a.action = 'status_changed'
             and a.new_value = 'done'),
         w.updated_at)
 where w.status = 'done'
   and w.completed_at is null;

alter table public.work_orders enable trigger trg_audit_work_orders;
alter table public.work_orders enable trigger trg_work_orders_updated_at;

create or replace function public.work_orders_stamp_completed_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' then
      new.completed_at := coalesce(new.completed_at, now());
    elsif old.status is distinct from 'done' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_work_orders_stamp_completed_at on public.work_orders;
create trigger trg_work_orders_stamp_completed_at
  before insert or update of status on public.work_orders
  for each row execute function public.work_orders_stamp_completed_at();

-- completed_at moves with every status change to/from done, and the status
-- change is already the headline of that audit entry. Add it to the
-- top-level skip list of the LIVE fn_audit_log rather than restating the
-- whole function here: its body has drifted from the migration history
-- before, and a full restatement from a stale copy would silently revert
-- whatever else is live.
do $$
declare
  v_def  text := pg_get_functiondef('public.fn_audit_log()'::regprocedure);
  v_find text := '''amount_paid_cents'',''deleted_at'',';
begin
  if position('''completed_at''' in v_def) > 0 then
    return;  -- already patched
  end if;
  if (length(v_def) - length(replace(v_def, v_find, ''))) / length(v_find) <> 1 then
    raise exception 'fn_audit_log: expected exactly one top-level skip-list anchor, found a different shape — patch by hand';
  end if;
  execute replace(v_def, v_find, v_find || '''completed_at'',');
end $$;

-- ── 3. asset_status_history ─────────────────────────────────────────────────
-- Assets and vehicles live in separate tables whose ids never collide, so the
-- history is keyed on (entity_type, asset_id) without a foreign key, the same
-- way work_orders.asset_id + linked_entity_type already points at either.

create table if not exists public.asset_status_history (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null default public.my_org_id() references public.organizations(id),
  entity_type text        not null check (entity_type in ('asset', 'vehicle')),
  asset_id    uuid        not null,
  status      text        not null,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  created_by  uuid        references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint asset_status_history_period_check check (ended_at is null or ended_at >= started_at)
);

comment on table public.asset_status_history is
  'One row per status period of an asset or vehicle (open period has ended_at null). Written only by trg_*_status_history; uptime = active time ÷ (active + in_shop + out_of_service time).';

create unique index if not exists asset_status_history_one_open_period
  on public.asset_status_history (entity_type, asset_id)
  where ended_at is null and deleted_at is null;
create index if not exists asset_status_history_asset_idx
  on public.asset_status_history (org_id, entity_type, asset_id, started_at);

alter table public.asset_status_history enable row level security;

-- Read-only to the org. Rows are written solely by the SECURITY DEFINER
-- trigger below, so there is deliberately no INSERT/UPDATE/DELETE policy.
drop policy if exists "org_members_read_asset_status_history" on public.asset_status_history;
create policy "org_members_read_asset_status_history" on public.asset_status_history
  for select using (org_id = public.my_org_id());

create or replace function public.record_asset_status_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_type text := case tg_table_name when 'vehicles' then 'vehicle' else 'asset' end;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  update asset_status_history
     set ended_at = greatest(started_at, now()), updated_at = now()
   where entity_type = v_type
     and asset_id = new.id
     and ended_at is null
     and deleted_at is null;

  insert into asset_status_history (org_id, entity_type, asset_id, status, started_at, created_by)
  values (
    new.org_id, v_type, new.id, new.status, now(),
    (select p.id from profiles p where p.id = auth.uid())
  );

  return new;
end;
$$;

revoke all on function public.record_asset_status_change() from public, anon, authenticated;

drop trigger if exists trg_assets_status_history on public.assets;
create trigger trg_assets_status_history
  after insert or update of status on public.assets
  for each row execute function public.record_asset_status_change();

drop trigger if exists trg_vehicles_status_history on public.vehicles;
create trigger trg_vehicles_status_history
  after insert or update of status on public.vehicles
  for each row execute function public.record_asset_status_change();

-- Backfill: replay each record's status_changed audit entries into periods.
-- The first period starts when the record was created, in the status the
-- first change moved it OUT of. Duplicate audit entries (the same change
-- logged twice) are skipped. The current table value wins over the audit
-- trail for the open period, in case a change went unaudited.
do $$
declare
  r        record;
  chg      record;
  v_status text;
  v_start  timestamptz;
  v_first  boolean;
begin
  for r in
    select 'asset'::text as entity_type, id, org_id, status, created_at from public.assets
    union all
    select 'vehicle', id, org_id, status, created_at from public.vehicles
  loop
    continue when exists (
      select 1 from public.asset_status_history h
       where h.entity_type = r.entity_type and h.asset_id = r.id);

    v_status := null;
    v_start  := r.created_at;
    v_first  := true;

    for chg in
      select a.old_value, a.new_value, a.created_at
        from public.audit_log a
       where a.record_type = r.entity_type
         and a.record_id = r.id
         and a.action = 'status_changed'
         and a.old_value is not null
         and a.new_value is not null
       order by a.created_at, a.id
    loop
      if v_first then
        v_status := chg.old_value;
        v_first  := false;
      end if;
      continue when chg.new_value = v_status;

      insert into public.asset_status_history (org_id, entity_type, asset_id, status, started_at, ended_at)
      values (r.org_id, r.entity_type, r.id, v_status, v_start, greatest(v_start, chg.created_at));

      v_status := chg.new_value;
      v_start  := greatest(v_start, chg.created_at);
    end loop;

    insert into public.asset_status_history (org_id, entity_type, asset_id, status, started_at)
    values (r.org_id, r.entity_type, r.id, r.status, v_start);
  end loop;
end $$;

-- ── 4. PM work order outcomes ───────────────────────────────────────────────
-- A "PM unit" is one scheduled PM on one asset: a PM-generated work order
-- that is not the parent of a multi-asset batch (the batch's sub-WOs are the
-- units; the parent is only a container).
--
--   on_time   done on or before its due date
--   late      done after its due date
--   completed done, but it has no due date to measure against (PM WOs were
--             generated without one until 2026-09-27)
--   skipped   marked skipped — counts as missed
--   overdue   still open past its due date — counts as missed
--   pending   open and not yet due — not counted either way
--
-- PM compliance = (on_time + late + completed) ÷ (that + skipped + overdue).
-- On-time rate  = on_time ÷ (on_time + late), where a due date exists.

create or replace view public.v_pm_work_order_outcomes
with (security_invoker = on) as
select
  w.id                                             as work_order_id,
  w.org_id,
  w.work_order_number,
  w.pm_schedule_id,
  s.title                                          as pm_schedule_title,
  w.asset_id,
  w.asset_name,
  w.status,
  w.due_date,
  coalesce(w.due_date, (w.created_at at time zone public.org_timezone(w.org_id))::date) as due_on,
  w.completed_at,
  (w.completed_at at time zone public.org_timezone(w.org_id))::date                  as completed_on,
  case
    when w.status = 'done' and w.due_date is not null
         and (w.completed_at at time zone public.org_timezone(w.org_id))::date > w.due_date then 'late'
    when w.status = 'done' and w.due_date is not null                                     then 'on_time'
    when w.status = 'done'                                                                then 'completed'
    when w.status = 'skipped'                                                             then 'skipped'
    when w.due_date is not null and w.due_date < public.org_today(w.org_id)               then 'overdue'
    else 'pending'
  end                                              as outcome
from public.work_orders w
left join public.pm_schedules s on s.id = w.pm_schedule_id
where w.deleted_at is null
  and w.pm_schedule_id is not null
  and not exists (
    select 1 from public.work_orders c
     where c.parent_work_order_id = w.id and c.deleted_at is null
  );

comment on view public.v_pm_work_order_outcomes is
  'One row per PM unit (PM work order, excluding multi-asset batch parents) with its compliance outcome. security_invoker, so work_orders RLS applies.';

revoke all on public.v_pm_work_order_outcomes from anon;
grant select on public.v_pm_work_order_outcomes to authenticated;

-- ── 5. cmms_asset_metrics ───────────────────────────────────────────────────
-- Window-based figures (uptime, downtime events, MTTR, WOs, PM compliance)
-- use p_window_days. Costs are always both trailing-12-months and lifetime.
-- Uptime counts only in-service time: "inactive" (parked for the season) and
-- "disposed" periods are excluded from both sides rather than scored as up.
-- SECURITY INVOKER: every table read is filtered by the caller's RLS.

create or replace function public.cmms_asset_metrics(
  p_window_days integer default 90,
  p_asset_id    uuid    default null
)
returns table (
  entity_type           text,
  asset_id              uuid,
  name                  text,
  asset_tag             text,
  asset_type            text,
  status                text,
  location              text,
  purchase_price        integer,
  warranty_end_date     date,
  window_days           integer,
  uptime_pct            numeric,
  in_service_hours      numeric,
  downtime_hours        numeric,
  downtime_events       integer,
  mttr_hours            numeric,
  down_since            timestamptz,
  wo_count              integer,
  open_wo_count         integer,
  cost_12mo_cents       bigint,
  pm_cost_12mo_cents    bigint,
  cost_lifetime_cents   bigint,
  pm_cost_lifetime_cents bigint,
  pm_due                integer,
  pm_completed          integer,
  pm_on_time            integer,
  pm_late               integer,
  pm_skipped            integer,
  pm_overdue            integer
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with params as (
    select now() as t_end,
           now() - make_interval(days => greatest(1, least(coalesce(p_window_days, 90), 3650))) as t_start,
           greatest(1, least(coalesce(p_window_days, 90), 3650)) as days
  ),
  units as (
    select 'asset'::text as entity_type, a.id, a.org_id, a.name, a.asset_tag, a.asset_type, a.status,
           a.location, a.purchase_price, a.warranty_end_date
      from assets a
     where a.deleted_at is null and (p_asset_id is null or a.id = p_asset_id)
    union all
    select 'vehicle', v.id, v.org_id, v.name, v.asset_tag, v.asset_type, v.status,
           v.location, v.purchase_price, v.warranty_end_date
      from vehicles v
     where v.deleted_at is null and (p_asset_id is null or v.id = p_asset_id)
  ),
  periods as (
    select h.entity_type, h.asset_id, h.status, h.started_at, h.ended_at,
           greatest(h.started_at, p.t_start)             as s,
           least(coalesce(h.ended_at, p.t_end), p.t_end) as e,
           h.status in ('in_shop', 'out_of_service')     as is_down,
           p.t_start
      from asset_status_history h
      join units u on u.id = h.asset_id and u.entity_type = h.entity_type
     cross join params p
     where h.deleted_at is null
       and coalesce(h.ended_at, p.t_end) > p.t_start
  ),
  uptime as (
    select entity_type, asset_id,
           coalesce(sum(extract(epoch from (e - s))) filter (where is_down and e > s), 0)            as down_secs,
           coalesce(sum(extract(epoch from (e - s))) filter (where status = 'active' and e > s), 0)  as active_secs,
           count(*) filter (where is_down and started_at >= t_start)                                  as events,
           avg(extract(epoch from (ended_at - started_at)))
             filter (where is_down and ended_at is not null and started_at >= t_start)               as mttr_secs,
           max(started_at) filter (where is_down and ended_at is null)                               as down_since
      from periods
     group by entity_type, asset_id
  ),
  wos as (
    select w.id, w.asset_id, w.status, w.created_at,
           coalesce(w.completed_at, w.created_at) as cost_at,
           (w.wo_type = 'preventive' or w.pm_schedule_id is not null) as is_pm
      from work_orders w
     where w.deleted_at is null
       and w.asset_id in (select id from units)
  ),
  wo_cost as (
    select wos.id,
           coalesce((select sum(p.quantity::bigint * p.unit_cost) from wo_parts p
                      where p.work_order_id = wos.id and p.deleted_at is null), 0)
         + coalesce((select sum(round(l.hours * l.hourly_rate))::bigint from wo_labor_entries l
                      where l.work_order_id = wos.id and l.deleted_at is null), 0)
         + coalesce((select sum(c.cost)::bigint from wo_vendor_charges c
                      where c.work_order_id = wos.id and c.deleted_at is null), 0) as cents
      from wos
     where wos.status <> 'skipped'
  ),
  wo_rollup as (
    select wos.asset_id,
           count(*) filter (where wos.created_at >= p.t_start)                           as wo_count,
           count(*) filter (where wos.status not in ('done', 'skipped'))                  as open_count,
           coalesce(sum(c.cents) filter (where wos.cost_at >= p.t_end - interval '12 months'), 0)               as c12,
           coalesce(sum(c.cents) filter (where wos.is_pm and wos.cost_at >= p.t_end - interval '12 months'), 0) as pm_c12,
           coalesce(sum(c.cents), 0)                                                      as c_life,
           coalesce(sum(c.cents) filter (where wos.is_pm), 0)                             as pm_c_life
      from wos
      left join wo_cost c on c.id = wos.id
     cross join params p
     group by wos.asset_id
  ),
  pm as (
    select o.asset_id,
           count(*) filter (where o.outcome in ('on_time', 'late', 'completed'))                          as completed,
           count(*) filter (where o.outcome in ('on_time', 'late', 'completed', 'skipped', 'overdue'))    as due,
           count(*) filter (where o.outcome = 'on_time')                                                  as on_time,
           count(*) filter (where o.outcome = 'late')                                                     as late,
           count(*) filter (where o.outcome = 'skipped')                                                  as skipped,
           count(*) filter (where o.outcome = 'overdue')                                                  as overdue
      from v_pm_work_order_outcomes o
     cross join params p
     where o.asset_id in (select id from units)
       and o.due_on >= (p.t_start at time zone org_timezone(o.org_id))::date
     group by o.asset_id
  )
  select u.entity_type, u.id, u.name, u.asset_tag, u.asset_type, u.status, u.location,
         u.purchase_price, u.warranty_end_date,
         (select days from params)::integer,
         case when coalesce(up.active_secs, 0) + coalesce(up.down_secs, 0) > 0
              then round(100.0 * up.active_secs / (up.active_secs + up.down_secs), 1) end,
         round((coalesce(up.active_secs, 0) + coalesce(up.down_secs, 0)) / 3600.0, 1),
         round(coalesce(up.down_secs, 0) / 3600.0, 1),
         coalesce(up.events, 0)::integer,
         round(up.mttr_secs / 3600.0, 1),
         up.down_since,
         coalesce(wr.wo_count, 0)::integer,
         coalesce(wr.open_count, 0)::integer,
         coalesce(wr.c12, 0)::bigint,
         coalesce(wr.pm_c12, 0)::bigint,
         coalesce(wr.c_life, 0)::bigint,
         coalesce(wr.pm_c_life, 0)::bigint,
         coalesce(pm.due, 0)::integer,
         coalesce(pm.completed, 0)::integer,
         coalesce(pm.on_time, 0)::integer,
         coalesce(pm.late, 0)::integer,
         coalesce(pm.skipped, 0)::integer,
         coalesce(pm.overdue, 0)::integer
    from units u
    left join uptime    up on up.asset_id = u.id and up.entity_type = u.entity_type
    left join wo_rollup wr on wr.asset_id = u.id
    left join pm           on pm.asset_id = u.id
   order by u.name;
$$;

comment on function public.cmms_asset_metrics(integer, uuid) is
  'Per-asset/vehicle uptime, downtime, MTTR, WO counts, 12-month + lifetime maintenance cost (cents), and PM compliance over the trailing p_window_days. SECURITY INVOKER — RLS scopes it to the caller''s org.';

revoke all on function public.cmms_asset_metrics(integer, uuid) from public, anon;
grant execute on function public.cmms_asset_metrics(integer, uuid) to authenticated;

notify pgrst, 'reload schema';
