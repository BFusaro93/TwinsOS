-- cmms_asset_metrics: count outages, not status rows.
--
-- Downtime events and MTTR were computed per asset_status_history row, so an
-- asset that went active → in_shop → out_of_service → active was TWO
-- breakdowns with half the repair time each, and a status fat-fingered and
-- corrected within seconds was a breakdown too.
--
-- Now consecutive down rows (in_shop / out_of_service) are merged into one
-- outage, and so are down rows separated by less than a minute of being up
-- (a quick flip back and forth). An outage that lasted under a minute isn't
-- counted as an event (or in MTTR). Down HOURS are unchanged — still the sum
-- of time spent in down statuses within the window — and down_since is now
-- when the current outage began, not when its latest status row did.
--
-- Everything else is re-stated unchanged from the live PROD definition of
-- 2026-09-28.

create or replace function public.cmms_asset_metrics(p_window_days integer default 90, p_asset_id uuid default null::uuid)
returns table(entity_type text, asset_id uuid, name text, asset_tag text, asset_type text, status text, location text, purchase_price integer, warranty_end_date date, window_days integer, uptime_pct numeric, in_service_hours numeric, downtime_hours numeric, downtime_events integer, mttr_hours numeric, down_since timestamp with time zone, wo_count integer, open_wo_count integer, cost_12mo_cents bigint, pm_cost_12mo_cents bigint, cost_lifetime_cents bigint, pm_cost_lifetime_cents bigint, pm_due integer, pm_completed integer, pm_on_time integer, pm_late integer, pm_skipped integer, pm_overdue integer, pm_not_generated integer)
language sql
stable
set search_path to 'public'
as $function$
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
           coalesce(sum(extract(epoch from (e - s))) filter (where status = 'active' and e > s), 0)  as active_secs
      from periods
     group by entity_type, asset_id
  ),
  -- Down rows over all history (an outage can begin before the window).
  down_rows as (
    select h.entity_type, h.asset_id, h.started_at, h.ended_at,
           max(coalesce(h.ended_at, 'infinity'::timestamptz))
             over (partition by h.entity_type, h.asset_id order by h.started_at, h.id
                   rows between unbounded preceding and 1 preceding) as prev_end
      from asset_status_history h
      join units u on u.id = h.asset_id and u.entity_type = h.entity_type
     where h.deleted_at is null
       and h.status in ('in_shop', 'out_of_service')
  ),
  down_islands as (
    select d.*,
           sum(case when d.prev_end is null or d.started_at > d.prev_end + interval '1 minute' then 1 else 0 end)
             over (partition by d.entity_type, d.asset_id order by d.started_at
                   rows between unbounded preceding and current row) as outage_no
      from down_rows d
  ),
  outages as (
    select entity_type, asset_id, outage_no,
           min(started_at) as started_at,
           case when bool_or(ended_at is null) then null else max(ended_at) end as ended_at
      from down_islands
     group by entity_type, asset_id, outage_no
  ),
  outage_stats as (
    select o.entity_type, o.asset_id,
           count(*) filter (where o.started_at >= p.t_start
                              and (o.ended_at is null or o.ended_at - o.started_at >= interval '1 minute')) as events,
           avg(extract(epoch from (o.ended_at - o.started_at)))
             filter (where o.ended_at is not null and o.started_at >= p.t_start
                       and o.ended_at - o.started_at >= interval '1 minute')                           as mttr_secs,
           max(o.started_at) filter (where o.ended_at is null)                                         as down_since
      from outages o
     cross join params p
     group by o.entity_type, o.asset_id
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
           count(*) filter (where o.outcome in ('on_time', 'late', 'completed'))                                          as completed,
           count(*) filter (where o.outcome in ('on_time', 'late', 'completed', 'skipped', 'overdue', 'not_generated'))   as due,
           count(*) filter (where o.outcome = 'on_time')                                                                  as on_time,
           count(*) filter (where o.outcome = 'late')                                                                     as late,
           count(*) filter (where o.outcome = 'skipped')                                                                  as skipped,
           count(*) filter (where o.outcome = 'overdue')                                                                  as overdue,
           count(*) filter (where o.outcome = 'not_generated')                                                            as not_generated
      from v_pm_outcomes o
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
         coalesce(os.events, 0)::integer,
         round(os.mttr_secs / 3600.0, 1),
         os.down_since,
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
         coalesce(pm.overdue, 0)::integer,
         coalesce(pm.not_generated, 0)::integer
    from units u
    left join uptime       up on up.asset_id = u.id and up.entity_type = u.entity_type
    left join outage_stats os on os.asset_id = u.id and os.entity_type = u.entity_type
    left join wo_rollup    wr on wr.asset_id = u.id
    left join pm              on pm.asset_id = u.id
   order by u.name;
$function$;

revoke all on function public.cmms_asset_metrics(integer, uuid) from public, anon;
grant execute on function public.cmms_asset_metrics(integer, uuid) to authenticated;
