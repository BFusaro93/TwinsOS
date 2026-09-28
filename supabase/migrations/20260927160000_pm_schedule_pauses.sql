-- Pausing PM schedules (winter for mowers, a truck parked for a season).
--
-- Compliance now counts cycles nobody generated as missed
-- (20260927150000), so a schedule that legitimately isn't running needs a way
-- to say so — with dates, so paused weeks stop counting against the asset
-- without erasing the weeks that did count. pm_schedules.is_active has no
-- history, which is why this is a table of windows rather than a flag.
--
--   pm_schedule_pauses   one row per pause window. resumes_on is the first
--                        day the schedule runs again (exclusive); null = paused
--                        until someone resumes it. recurs_yearly repeats the
--                        same month/day window every year from starts_on on
--                        (e.g. Dec 1 → Apr 1), and needs a resumes_on.
--   pm_schedule_paused_on(schedule, date)
--   pm_schedule_next_cycle(schedule, anchor, after)
--                        first cycle on the schedule's cadence from `anchor`
--                        that falls after `after` and isn't paused. generate-wo
--                        uses it for the batch's due date and for the next due
--                        date, so the calendar keeps its weekday (a late
--                        Tuesday batch generated on Sunday leaves next due on
--                        Tuesday) and a resumed schedule doesn't come back due
--                        on a date inside its pause.
--   v_pm_schedule_pause_state
--                        per schedule: paused today? until when?
--   v_pm_outcomes        re-created: cycles that fall in a pause are neither
--                        missed nor due.

create table if not exists public.pm_schedule_pauses (
  id             uuid        primary key default gen_random_uuid(),
  org_id         uuid        not null default public.my_org_id() references public.organizations(id),
  pm_schedule_id uuid        not null references public.pm_schedules(id),
  starts_on      date        not null,
  resumes_on     date,
  recurs_yearly  boolean     not null default false,
  reason         text,
  created_by     uuid        references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint pm_schedule_pauses_window_check check (resumes_on is null or resumes_on > starts_on),
  constraint pm_schedule_pauses_yearly_check check (
    not recurs_yearly or (resumes_on is not null and resumes_on <= starts_on + 366)
  )
);

comment on table public.pm_schedule_pauses is
  'Windows when a PM schedule is paused. Cycles due in a window are not generated, not alerted on, and not counted in PM compliance.';

create index if not exists pm_schedule_pauses_schedule_idx
  on public.pm_schedule_pauses (pm_schedule_id) where deleted_at is null;

drop trigger if exists trg_pm_schedule_pauses_updated_at on public.pm_schedule_pauses;
create trigger trg_pm_schedule_pauses_updated_at
  before update on public.pm_schedule_pauses
  for each row execute function public.set_updated_at();

alter table public.pm_schedule_pauses enable row level security;

-- Mirrors pm_schedules: any org member, blocked while the org is read-only.
drop policy if exists "org_members_pm_schedule_pauses" on public.pm_schedule_pauses;
create policy "org_members_pm_schedule_pauses" on public.pm_schedule_pauses
  for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
drop policy if exists "read_only_when_canceled_ins" on public.pm_schedule_pauses;
create policy "read_only_when_canceled_ins" on public.pm_schedule_pauses
  as restrictive for insert with check ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_upd" on public.pm_schedule_pauses;
create policy "read_only_when_canceled_upd" on public.pm_schedule_pauses
  as restrictive for update using ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_del" on public.pm_schedule_pauses;
create policy "read_only_when_canceled_del" on public.pm_schedule_pauses
  as restrictive for delete using ((select public.my_org_is_read_only()) is not true);

-- ── pause arithmetic ────────────────────────────────────────────────────────

create or replace function public.pm_schedule_paused_on(p_schedule_id uuid, p_on date)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select exists (
    select 1 from pm_schedule_pauses p
     where p.pm_schedule_id = p_schedule_id
       and p.deleted_at is null
       and p_on >= p.starts_on
       and case
             when not p.recurs_yearly then p.resumes_on is null or p_on < p.resumes_on
             -- Same month/day window every year; a window that crosses New
             -- Year (Dec 1 → Apr 1) wraps.
             when to_char(p.starts_on, 'MMDD') < to_char(p.resumes_on, 'MMDD') then
               to_char(p_on, 'MMDD') >= to_char(p.starts_on, 'MMDD')
               and to_char(p_on, 'MMDD') < to_char(p.resumes_on, 'MMDD')
             else
               to_char(p_on, 'MMDD') >= to_char(p.starts_on, 'MMDD')
               or to_char(p_on, 'MMDD') < to_char(p.resumes_on, 'MMDD')
           end
  );
$$;

create or replace function public.pm_schedule_next_cycle(p_schedule_id uuid, p_anchor date, p_after date)
returns date
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_freq text;
  v_d    date;
  k      integer := 0;
begin
  select frequency into v_freq from pm_schedules where id = p_schedule_id;
  if v_freq is null or p_anchor is null then
    return null;
  end if;
  loop
    v_d := pm_cycle_date(p_anchor, v_freq, k);
    exit when v_d is null;
    if v_d > p_after and not pm_schedule_paused_on(p_schedule_id, v_d) then
      return v_d;
    end if;
    k := k + 1;
    -- Twenty years of daily cycles: an open-ended pause returns null
    -- rather than looping forever.
    exit when k > 7400;
  end loop;
  return null;
end;
$$;

revoke all on function public.pm_schedule_paused_on(uuid, date) from public, anon;
revoke all on function public.pm_schedule_next_cycle(uuid, date, date) from public, anon;
grant execute on function public.pm_schedule_paused_on(uuid, date) to authenticated, service_role;
grant execute on function public.pm_schedule_next_cycle(uuid, date, date) to authenticated, service_role;

-- ── pause state per schedule ────────────────────────────────────────────────

create or replace view public.v_pm_schedule_pause_state
with (security_invoker = on) as
select s.id as pm_schedule_id,
       s.org_id,
       cur.id is not null as paused_today,
       cur.id             as current_pause_id,
       cur.recurs_yearly,
       -- When the current pause ends: a one-off's resumes_on (null = until
       -- resumed), or the next end of a yearly window.
       case
         when cur.id is null then null
         when not cur.recurs_yearly then cur.resumes_on
         else (
           select min(d) from (
             select (cur.resumes_on + make_interval(years => y - extract(year from cur.resumes_on)::int))::date as d
               from generate_series(extract(year from public.org_today(s.org_id))::int,
                                    extract(year from public.org_today(s.org_id))::int + 1) y
           ) x where d > public.org_today(s.org_id)
         )
       end as paused_until
  from public.pm_schedules s
  left join lateral (
    select p.id, p.recurs_yearly, p.resumes_on
      from public.pm_schedule_pauses p
     where p.pm_schedule_id = s.id and p.deleted_at is null
       and public.org_today(s.org_id) >= p.starts_on
       and case
             when not p.recurs_yearly then p.resumes_on is null or public.org_today(s.org_id) < p.resumes_on
             when to_char(p.starts_on, 'MMDD') < to_char(p.resumes_on, 'MMDD') then
               to_char(public.org_today(s.org_id), 'MMDD') >= to_char(p.starts_on, 'MMDD')
               and to_char(public.org_today(s.org_id), 'MMDD') < to_char(p.resumes_on, 'MMDD')
             else
               to_char(public.org_today(s.org_id), 'MMDD') >= to_char(p.starts_on, 'MMDD')
               or to_char(public.org_today(s.org_id), 'MMDD') < to_char(p.resumes_on, 'MMDD')
           end
     order by p.resumes_on nulls first
     limit 1
  ) cur on true
 where s.deleted_at is null;

revoke all on public.v_pm_schedule_pause_state from anon;
grant select on public.v_pm_schedule_pause_state to authenticated;

-- ── v_pm_outcomes: paused cycles are neither due nor missed ─────────────────

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
         lead(coalesce(w.due_date, (w.created_at at time zone public.org_timezone(w.org_id))::date))
           over (partition by w.pm_schedule_id
                 order by coalesce(w.due_date, (w.created_at at time zone public.org_timezone(w.org_id))::date), w.created_at) as next_on
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
