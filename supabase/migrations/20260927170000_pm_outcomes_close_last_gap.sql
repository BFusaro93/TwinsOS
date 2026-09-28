-- v_pm_outcomes: close the last gap at the schedule's next due date.
--
-- Missed cycles between batches were only found once the NEXT batch existed.
-- Generating one late batch moves next_due_date past the cycles it skipped
-- (last week's batch generated after two missed weeks), so those cycles were
-- neither in a gap nor in the live trail from next_due_date until another
-- batch came along. The most recent batch's gap now ends at next_due_date.
-- Normal cadence is unaffected: a batch due 9/23 with next due 9/30 leaves no
-- gap, same as before.

create or replace view public.v_pm_outcomes
with (security_invoker = on) as
with wo_units as (
  -- PM-schedule work orders, excluding multi-asset batch parents (their
  -- sub-WOs are the units).
  select 'schedule'::text                         as source,
         w.pm_schedule_id                         as program_id,
         s.title                                  as program_name,
         w.id                                     as work_order_id,
         w.work_order_number,
         w.org_id, w.asset_id, w.asset_name, w.status, w.due_date,
         coalesce(w.due_date, (w.created_at at time zone public.org_timezone(w.org_id))::date) as due_on,
         w.due_date is not null                   as has_due,
         w.completed_at
    from public.work_orders w
    left join public.pm_schedules s on s.id = w.pm_schedule_id
   where w.deleted_at is null
     and w.pm_schedule_id is not null
     and not exists (select 1 from public.work_orders c
                      where c.parent_work_order_id = w.id and c.deleted_at is null)
  union all
  -- Meter-triggered work orders: due 7 days after the meter tripped.
  select 'meter', a.id, a.name, w.id, w.work_order_number,
         w.org_id, w.asset_id, w.asset_name, w.status, w.due_date,
         coalesce(w.due_date,
                  (coalesce(r.created_at, w.created_at) at time zone public.org_timezone(w.org_id))::date + 7),
         true,
         w.completed_at
    from public.work_orders w
    join public.automations a on a.id = w.automation_id and a.trigger_type = 'meter_threshold'
    left join lateral (
      select mr.created_at from public.maintenance_requests mr
       where mr.linked_work_order_id = w.id and mr.deleted_at is null
       order by mr.created_at limit 1
    ) r on true
   where w.deleted_at is null
     and w.pm_schedule_id is null
),
batches as (
  select w.id, w.org_id, w.pm_schedule_id, s.frequency,
         coalesce(w.due_date, (w.created_at at time zone public.org_timezone(w.org_id))::date) as cycle_on,
         -- The latest batch's gap runs to the schedule's next due date: a late
         -- batch moves next due past the cycles it skipped, and those are
         -- missed now, not only once another batch is generated.
         coalesce(
           lead(coalesce(w.due_date, (w.created_at at time zone public.org_timezone(w.org_id))::date))
             over (partition by w.pm_schedule_id
                   order by coalesce(w.due_date, (w.created_at at time zone public.org_timezone(w.org_id))::date), w.created_at),
           s.next_due_date
         ) as next_on
    from public.work_orders w
    join public.pm_schedules s on s.id = w.pm_schedule_id
   where w.deleted_at is null
     and w.pm_schedule_id is not null
     and w.parent_work_order_id is null
),
gap_units as (
  select b.org_id, b.pm_schedule_id, public.pm_cycle_date(b.cycle_on, b.frequency, k) as due_on,
         u.asset_id, u.asset_name
    from batches b
   cross join lateral generate_series(1, greatest(0, (b.next_on - b.cycle_on) / public.pm_cycle_min_days(b.frequency))) k
   cross join lateral (
     select c.asset_id, c.asset_name from public.work_orders c
      where c.parent_work_order_id = b.id and c.deleted_at is null and c.asset_id is not null
     union
     select w.asset_id, w.asset_name from public.work_orders w
      where w.id = b.id and w.asset_id is not null
   ) u
   where b.next_on is not null
     and public.pm_cycle_date(b.cycle_on, b.frequency, k + 1) <= b.next_on
     and not public.pm_schedule_paused_on(b.pm_schedule_id, public.pm_cycle_date(b.cycle_on, b.frequency, k))
),
trail_units as (
  select s.org_id, s.id as pm_schedule_id, public.pm_cycle_date(s.next_due_date, s.frequency, k) as due_on,
         sa.asset_id, coalesce(a.name, v.name, sa.asset_name) as asset_name
    from public.pm_schedules s
   cross join lateral generate_series(0, (public.org_today(s.org_id) - s.next_due_date) / public.pm_cycle_min_days(s.frequency)) k
    join public.pm_schedule_assets sa on sa.pm_schedule_id = s.id and sa.deleted_at is null
    left join public.assets a   on a.id = sa.asset_id and a.deleted_at is null and a.status <> 'disposed'
    left join public.vehicles v on v.id = sa.asset_id and v.deleted_at is null and v.status <> 'disposed'
   where s.deleted_at is null
     and s.is_active
     and s.next_due_date is not null
     and s.next_due_date < public.org_today(s.org_id)
     and public.pm_cycle_date(s.next_due_date, s.frequency, k) < public.org_today(s.org_id)
     and not public.pm_schedule_paused_on(s.id, public.pm_cycle_date(s.next_due_date, s.frequency, k))
     and (a.id is not null or v.id is not null)
)
select source, program_id, program_name, work_order_id, work_order_number, org_id, asset_id, asset_name,
       status, due_date, due_on, completed_at,
       (completed_at at time zone public.org_timezone(org_id))::date as completed_on,
       case
         when status = 'done' and has_due
              and (completed_at at time zone public.org_timezone(org_id))::date > due_on then 'late'
         when status = 'done' and has_due                                       then 'on_time'
         when status = 'done'                                                   then 'completed'
         when status = 'skipped'                                                then 'skipped'
         when has_due and due_on < public.org_today(org_id)                     then 'overdue'
         else 'pending'
       end as outcome
  from wo_units
union all
select 'schedule', g.pm_schedule_id, s.title, null::uuid, null::text, g.org_id, g.asset_id, g.asset_name,
       null::text, null::date, g.due_on, null::timestamptz, null::date, 'not_generated'
  from gap_units g
  join public.pm_schedules s on s.id = g.pm_schedule_id
union all
select 'schedule', t.pm_schedule_id, s.title, null::uuid, null::text, t.org_id, t.asset_id, t.asset_name,
       null::text, null::date, t.due_on, null::timestamptz, null::date, 'not_generated'
  from trail_units t
  join public.pm_schedules s on s.id = t.pm_schedule_id
union all
select 'meter', a.id, a.name, null::uuid, null::text, r.org_id, r.asset_id, r.asset_name,
       r.status, null::date,
       (r.created_at at time zone public.org_timezone(r.org_id))::date + 7,
       null::timestamptz, null::date, 'not_generated'
  from public.maintenance_requests r
  join public.automations a on a.id = r.automation_id and a.trigger_type = 'meter_threshold'
 where r.deleted_at is null
   and r.linked_work_order_id is null
   and r.status in ('open', 'in_review', 'approved')
   and (r.created_at at time zone public.org_timezone(r.org_id))::date + 7 < public.org_today(r.org_id);

comment on view public.v_pm_outcomes is
  'One row per PM unit — a scheduled or meter-triggered PM on one asset — with its compliance outcome, including cycles that were never generated (outcome not_generated, work_order_id null). Cycles inside a pm_schedule_pauses window are excluded. security_invoker, so RLS applies.';

notify pgrst, 'reload schema';
