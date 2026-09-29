-- PM compliance from recorded history, month-end anchors, and pauses that end
-- instead of disappearing.
--
-- Problems fixed (all in v_pm_outcomes / pm_schedule_paused_on as of
-- 20260927170000):
--
--  1. Compliance used the schedule's CURRENT frequency for all of history and
--     ran the latest batch's gap to the CURRENT next_due_date, so editing
--     either rewrote past compliance (pushing next due out a month suddenly
--     "missed" four weekly cycles in the past).
--  2. Monthly schedules on the 29th–31st drifted to the 28th: every
--     generation re-anchored the cadence on the batch's (already clamped) due
--     date. pm_schedules.anchor_date now holds the day the cadence is counted
--     from, so Jan 31 → Feb 28 → Mar 31.
--  3. Deleting a pause re-scored the cycles it had excused as missed, and a
--     yearly pause whose end month/day equals its start month/day passed the
--     CHECK but covered every day of every year.
--
-- THE COMPLIANCE RULE (documented here, and in the Help Center PM article):
--
--   Every change to a schedule's next due date, frequency or anchor is
--   recorded in pm_schedule_cadence_history (trigger, including generation's
--   own advance). Each record opens an "expectation" that lasts until the
--   next record. Within an expectation, the cycles on its cadence from its
--   next due date are expected; a cycle is MISSED (not_generated) when
--     * its due date passed while that expectation was in effect
--       (due on or after the day it was recorded, and before the day the next
--       record replaced it — or before today for the current one),
--     * it isn't inside a pause, and
--     * no work order batch of the schedule is due that day.
--   So a manual reschedule or frequency change only affects cycles from the
--   day it was made; one made before a cycle came due means that cycle was
--   never owed. Generation ends an expectation too: the batch covers the cycle
--   it was generated for, and the cycles between that one and the day it was
--   generated are missed (same as before).
--
--   History from before this migration isn't recorded, so each schedule gets
--   a 'backfill' record of its state today, which — having no earlier record
--   to replace — is in effect from its next due date on (the old live trail).
--   Batches from before it keep the old between-batches gap rule, using the
--   frequency at the time of this migration, and stop at that record's next
--   due date, so later edits can't reach back past it.
--
-- Pauses: "removing" a pause that has already started now ENDS it today
-- (end_pm_schedule_pause): a one-off gets resumes_on = today, a yearly one
-- gets ended_on = today (no further seasons). Only a pause that hasn't
-- started (starts today or later) is really deleted. A trigger enforces
-- this, so no client can erase an excused cycle. Ending a pause also moves a
-- stale next due date (before today) to the next unpaused cycle on or after
-- today — the cycles owed before the pause stay recorded as missed in the
-- expectation that was in effect then.
--
-- Idempotent. Views/functions re-stated in full from the live PROD
-- definitions of 2026-09-28.

-- ── 1. Anchor day ────────────────────────────────────────────────────────────

alter table public.pm_schedules add column if not exists anchor_date date;

comment on column public.pm_schedules.anchor_date is
  'Day the schedule''s cadence is counted from (month-end safe: a Jan 31 monthly schedule is due Feb 28, then Mar 31). Kept on the cadence of next_due_date by trg_pm_schedules_anchor; reset to next_due_date when next due is moved off the cadence.';

-- Is p_d one of the cycles counted from p_anchor?
create or replace function public.pm_is_cycle_of(p_anchor date, p_frequency text, p_d date)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_step integer;
  v_months integer;
begin
  if p_anchor is null or p_d is null or p_frequency is null or p_d < p_anchor then
    return false;
  end if;
  if p_frequency = 'daily' then
    return true;
  elsif p_frequency = 'weekly' then
    return (p_d - p_anchor) % 7 = 0;
  end if;
  v_step := case p_frequency when 'monthly' then 1 when 'quarterly' then 3 when 'annual' then 12 end;
  if v_step is null then
    return false;
  end if;
  v_months := (extract(year from p_d)::integer - extract(year from p_anchor)::integer) * 12
            + (extract(month from p_d)::integer - extract(month from p_anchor)::integer);
  return v_months % v_step = 0
     and public.pm_cycle_date(p_anchor, p_frequency, v_months / v_step) = p_d;
end;
$$;

revoke all on function public.pm_is_cycle_of(date, text, date) from public, anon;
grant execute on function public.pm_is_cycle_of(date, text, date) to authenticated, service_role;

create or replace function public.pm_schedules_keep_anchor()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Next due moved off the anchor's cadence (or no anchor yet): the new date
  -- is the new anchor. A move along the cadence — generation, or a manual
  -- push by whole cycles — keeps it, so Jan 31 stays the anchor across Feb 28.
  if new.next_due_date is not null
     and (new.anchor_date is null
          or not public.pm_is_cycle_of(new.anchor_date, new.frequency, new.next_due_date)) then
    new.anchor_date := new.next_due_date;
  end if;
  return new;
end;
$$;

revoke all on function public.pm_schedules_keep_anchor() from public, anon;

drop trigger if exists trg_pm_schedules_anchor on public.pm_schedules;
create trigger trg_pm_schedules_anchor
  before insert or update of next_due_date, frequency, anchor_date on public.pm_schedules
  for each row execute function public.pm_schedules_keep_anchor();

-- Backfill: today's next due date is the best anchor we have (a schedule that
-- already drifted to the 28th stays there until someone sets it back).
-- (Audit and updated_at triggers off: this is bookkeeping, not an edit.)
alter table public.pm_schedules disable trigger trg_audit_pm_schedules;
alter table public.pm_schedules disable trigger trg_pm_schedules_updated_at;
update public.pm_schedules
   set anchor_date = next_due_date
 where anchor_date is null and next_due_date is not null;
alter table public.pm_schedules enable trigger trg_audit_pm_schedules;
alter table public.pm_schedules enable trigger trg_pm_schedules_updated_at;

-- ── 2. Cadence history ──────────────────────────────────────────────────────

create table if not exists public.pm_schedule_cadence_history (
  id             uuid        primary key default gen_random_uuid(),
  org_id         uuid        not null references public.organizations(id),
  pm_schedule_id uuid        not null references public.pm_schedules(id),
  effective_at   timestamptz not null default clock_timestamp(),
  frequency      text        not null,
  next_due_date  date,
  anchor_date    date,
  source         text        not null default 'updated',
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint pm_schedule_cadence_history_source_check
    check (source in ('backfill', 'created', 'updated', 'generated', 'resumed'))
);

comment on table public.pm_schedule_cadence_history is
  'One row per change to a PM schedule''s next due date / frequency / anchor (written only by trigger). v_pm_outcomes scores missed cycles against the expectation in effect when each cycle came due, so later edits don''t rewrite past compliance.';

create index if not exists pm_schedule_cadence_history_schedule_idx
  on public.pm_schedule_cadence_history (pm_schedule_id, effective_at);

alter table public.pm_schedule_cadence_history enable row level security;

-- Read-only for org members; rows are written by the SECURITY DEFINER trigger.
drop policy if exists "org_members_read_pm_cadence_history" on public.pm_schedule_cadence_history;
create policy "org_members_read_pm_cadence_history" on public.pm_schedule_cadence_history
  for select using (org_id = public.my_org_id());

revoke all on public.pm_schedule_cadence_history from anon;
revoke insert, update, delete, truncate on public.pm_schedule_cadence_history from authenticated;
grant select on public.pm_schedule_cadence_history to authenticated;

create or replace function public.pm_schedules_record_cadence()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE'
     and new.next_due_date is not distinct from old.next_due_date
     and new.frequency     is not distinct from old.frequency
     and new.anchor_date   is not distinct from old.anchor_date then
    return new;
  end if;
  insert into public.pm_schedule_cadence_history
    (org_id, pm_schedule_id, effective_at, frequency, next_due_date, anchor_date, source, created_by)
  values
    (new.org_id, new.id, clock_timestamp(), new.frequency, new.next_due_date, new.anchor_date,
     case when tg_op = 'INSERT' then 'created'
          else coalesce(nullif(current_setting('app.pm_cadence_source', true), ''), 'updated') end,
     auth.uid());
  return new;
end;
$$;

revoke all on function public.pm_schedules_record_cadence() from public, anon;

drop trigger if exists trg_pm_schedules_record_cadence on public.pm_schedules;
create trigger trg_pm_schedules_record_cadence
  after insert or update of next_due_date, frequency, anchor_date on public.pm_schedules
  for each row execute function public.pm_schedules_record_cadence();

-- One backfill record per schedule (deleted ones too: their old batches are
-- still scored).
insert into public.pm_schedule_cadence_history
  (org_id, pm_schedule_id, effective_at, frequency, next_due_date, anchor_date, source)
select s.org_id, s.id, now(), s.frequency, s.next_due_date, s.anchor_date, 'backfill'
  from public.pm_schedules s
 where s.frequency is not null
   and not exists (select 1 from public.pm_schedule_cadence_history h where h.pm_schedule_id = s.id);

-- ── 3. Pauses: end, don't delete ────────────────────────────────────────────

alter table public.pm_schedule_pauses add column if not exists ended_on date;

comment on column public.pm_schedule_pauses.ended_on is
  'Set when a yearly pause is ended: no season on or after this day is paused. Earlier seasons stay paused (history).';

alter table public.pm_schedule_pauses drop constraint if exists pm_schedule_pauses_yearly_check;
-- The same month/day for start and end (e.g. Mar 1 2027 → Mar 1 2028, which
-- the old "<= starts_on + 366" allowed) wrapped to cover every day forever.
alter table public.pm_schedule_pauses add constraint pm_schedule_pauses_yearly_check check (
  not recurs_yearly or (
    resumes_on is not null
    and resumes_on <= starts_on + 366
    and to_char(starts_on, 'MMDD') <> to_char(resumes_on, 'MMDD')
  )
);
alter table public.pm_schedule_pauses drop constraint if exists pm_schedule_pauses_ended_check;
alter table public.pm_schedule_pauses add constraint pm_schedule_pauses_ended_check
  check (ended_on is null or ended_on > starts_on);

-- One place for "does this pause cover this day".
create or replace function public.pm_pause_covers(
  p_starts_on date, p_resumes_on date, p_recurs_yearly boolean, p_ended_on date, p_on date)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select p_on >= p_starts_on
     and (p_ended_on is null or p_on < p_ended_on)
     and case
           when not p_recurs_yearly then p_resumes_on is null or p_on < p_resumes_on
           -- Same month/day window every year; a window that crosses New
           -- Year (Dec 1 → Apr 1) wraps.
           when to_char(p_starts_on, 'MMDD') < to_char(p_resumes_on, 'MMDD') then
             to_char(p_on, 'MMDD') >= to_char(p_starts_on, 'MMDD')
             and to_char(p_on, 'MMDD') < to_char(p_resumes_on, 'MMDD')
           else
             to_char(p_on, 'MMDD') >= to_char(p_starts_on, 'MMDD')
             or to_char(p_on, 'MMDD') < to_char(p_resumes_on, 'MMDD')
         end;
$$;

revoke all on function public.pm_pause_covers(date, date, boolean, date, date) from public, anon;
grant execute on function public.pm_pause_covers(date, date, boolean, date, date) to authenticated, service_role;

create or replace function public.pm_schedule_paused_on(p_schedule_id uuid, p_on date)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  -- Deleted pauses are ignored — which is safe only because a pause can't be
  -- deleted once it has started (trg_pm_schedule_pauses_guard); started
  -- pauses are ended instead and keep excusing the cycles they covered.
  select exists (
    select 1 from pm_schedule_pauses p
     where p.pm_schedule_id = p_schedule_id
       and p.deleted_at is null
       and public.pm_pause_covers(p.starts_on, p.resumes_on, p.recurs_yearly, p.ended_on, p_on)
  );
$$;

revoke all on function public.pm_schedule_paused_on(uuid, date) from public, anon;
grant execute on function public.pm_schedule_paused_on(uuid, date) to authenticated, service_role;

-- History guard: a pause that has started can't be deleted or re-dated into
-- the past — that would re-score the cycles it excused as missed.
create or replace function public.pm_schedule_pauses_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_today date := public.org_today(old.org_id);
begin
  if old.deleted_at is not null or old.starts_on >= v_today
     or current_setting('app.pm_pause_admin', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'This pause has already started, so it can''t be deleted — end it instead. The cycles it paused stay excused.'
      using errcode = 'P0001';
  end if;
  if new.deleted_at is not null then
    raise exception 'This pause has already started, so it can''t be deleted — end it instead. The cycles it paused stay excused.'
      using errcode = 'P0001';
  end if;
  if new.starts_on <> old.starts_on or new.recurs_yearly <> old.recurs_yearly
     or new.pm_schedule_id <> old.pm_schedule_id then
    raise exception 'A pause that has already started can''t be moved. End it and add a new one.'
      using errcode = 'P0001';
  end if;
  if old.recurs_yearly and new.resumes_on is distinct from old.resumes_on then
    raise exception 'A seasonal pause that has already started can''t be re-dated. End it and add a new one.'
      using errcode = 'P0001';
  end if;
  if new.resumes_on is distinct from old.resumes_on
     and coalesce(new.resumes_on, 'infinity'::date) < v_today
     and coalesce(new.resumes_on, 'infinity'::date) < coalesce(old.resumes_on, 'infinity'::date) then
    raise exception 'A pause can''t be ended in the past.' using errcode = 'P0001';
  end if;
  if new.ended_on is distinct from old.ended_on
     and (coalesce(new.ended_on, 'infinity'::date) < v_today
          or (old.ended_on is not null and old.ended_on <= v_today)) then
    raise exception 'A pause can''t be ended in the past.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.pm_schedule_pauses_guard() from public, anon;

drop trigger if exists trg_pm_schedule_pauses_guard on public.pm_schedule_pauses;
create trigger trg_pm_schedule_pauses_guard
  before update or delete on public.pm_schedule_pauses
  for each row execute function public.pm_schedule_pauses_guard();

-- End (or, if it hasn't started, delete) a pause, then move a stale next due
-- date to the next unpaused cycle on or after today. SECURITY INVOKER: RLS on
-- pm_schedule_pauses / pm_schedules decides who may.
create or replace function public.end_pm_schedule_pause(p_pause_id uuid)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  p        pm_schedule_pauses%rowtype;
  s        pm_schedules%rowtype;
  v_today  date;
  v_next   date;
  v_anchor date;
  v_deleted boolean := false;
begin
  select * into p from pm_schedule_pauses where id = p_pause_id and deleted_at is null for update;
  if not found then
    raise exception 'Pause not found' using errcode = 'P0002';
  end if;
  v_today := public.org_today(p.org_id);

  if p.starts_on >= v_today then
    update pm_schedule_pauses set deleted_at = now() where id = p.id;
    v_deleted := true;
  elsif not p.recurs_yearly then
    if p.resumes_on is null or p.resumes_on > v_today then
      update pm_schedule_pauses set resumes_on = v_today where id = p.id;
    end if;
  elsif p.ended_on is null or p.ended_on > v_today then
    update pm_schedule_pauses set ended_on = v_today where id = p.id;
  end if;

  select * into s from pm_schedules where id = p.pm_schedule_id and deleted_at is null for update;
  if found and s.next_due_date is not null and s.next_due_date < v_today then
    v_anchor := case when s.frequency in ('monthly', 'quarterly', 'annual')
                     then coalesce(s.anchor_date, s.next_due_date) else s.next_due_date end;
    v_next := public.pm_schedule_next_cycle(s.id, v_anchor, v_today - 1);
    if v_next is not null then
      perform set_config('app.pm_cadence_source', 'resumed', true);
      update pm_schedules set next_due_date = v_next where id = s.id;
      perform set_config('app.pm_cadence_source', '', true);
    end if;
  end if;

  return jsonb_build_object('deleted', v_deleted, 'next_due_date', v_next);
end;
$$;

revoke all on function public.end_pm_schedule_pause(uuid) from public, anon;
grant execute on function public.end_pm_schedule_pause(uuid) to authenticated, service_role;

-- Re-stated from PROD with the shared predicate and ended_on.
create or replace view public.v_pm_schedule_pause_state
with (security_invoker = on) as
select s.id as pm_schedule_id,
       s.org_id,
       cur.id is not null as paused_today,
       cur.id as current_pause_id,
       cur.recurs_yearly,
       case
         when cur.id is null then null::date
         when not cur.recurs_yearly then cur.resumes_on
         else least(
           cur.ended_on,
           (select min(x.d)
              from (select (cur.resumes_on + make_interval(years => y.y - extract(year from cur.resumes_on)::integer))::date as d
                      from generate_series(extract(year from public.org_today(s.org_id))::integer,
                                           extract(year from public.org_today(s.org_id))::integer + 1) y(y)) x
             where x.d > public.org_today(s.org_id)))
       end as paused_until
  from public.pm_schedules s
  left join lateral (
    select p.id, p.recurs_yearly, p.resumes_on, p.ended_on
      from public.pm_schedule_pauses p
     where p.pm_schedule_id = s.id
       and p.deleted_at is null
       and public.pm_pause_covers(p.starts_on, p.resumes_on, p.recurs_yearly, p.ended_on, public.org_today(s.org_id))
     order by p.resumes_on nulls first
     limit 1
  ) cur on true
 where s.deleted_at is null;

revoke all on public.v_pm_schedule_pause_state from anon;
grant select on public.v_pm_schedule_pause_state to authenticated;

-- ── 4. v_pm_outcomes ────────────────────────────────────────────────────────

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
-- Each schedule's first recorded expectation (the backfill record, or the
-- 'created' one for schedules made after it). Batches before it are legacy.
first_rec as (
  select distinct on (h.pm_schedule_id)
         h.pm_schedule_id, h.effective_at, h.frequency, h.next_due_date
    from public.pm_schedule_cadence_history h
   where h.deleted_at is null
   order by h.pm_schedule_id, h.effective_at, h.id
),
legacy_batches as (
  select w.id, w.org_id, w.pm_schedule_id, f.frequency,
         coalesce(w.due_date, (w.created_at at time zone public.org_timezone(w.org_id))::date) as cycle_on,
         -- Gaps run to the next legacy batch, and never past the first
         -- recorded expectation's next due date (from there on the recorded
         -- expectations decide).
         least(
           coalesce(
             lead(coalesce(w.due_date, (w.created_at at time zone public.org_timezone(w.org_id))::date))
               over (partition by w.pm_schedule_id
                     order by coalesce(w.due_date, (w.created_at at time zone public.org_timezone(w.org_id))::date), w.created_at),
             f.next_due_date),
           f.next_due_date
         ) as next_on
    from public.work_orders w
    join first_rec f on f.pm_schedule_id = w.pm_schedule_id
   where w.deleted_at is null
     and w.pm_schedule_id is not null
     and w.parent_work_order_id is null
     and w.created_at < f.effective_at
),
legacy_gap_units as (
  -- A legacy gap cycle is missed only if the next batch is at least two
  -- intervals later (legacy batches had no due date, so a late batch covers
  -- the last cycle before it).
  select b.org_id, b.pm_schedule_id,
         public.pm_cycle_date(b.cycle_on, b.frequency, k.k) as due_on,
         u.asset_id, u.asset_name
    from legacy_batches b
   cross join lateral generate_series(1, greatest(0, (b.next_on - b.cycle_on) / public.pm_cycle_min_days(b.frequency))) as k(k)
   cross join lateral (
     select c.asset_id, c.asset_name from public.work_orders c
      where c.parent_work_order_id = b.id and c.deleted_at is null and c.asset_id is not null
     union
     select w.asset_id, w.asset_name from public.work_orders w
      where w.id = b.id and w.asset_id is not null
   ) u
   where b.next_on is not null
     and public.pm_cycle_date(b.cycle_on, b.frequency, k.k + 1) <= b.next_on
     and not public.pm_schedule_paused_on(b.pm_schedule_id, public.pm_cycle_date(b.cycle_on, b.frequency, k.k))
),
expectations as (
  select h.org_id, h.pm_schedule_id, h.frequency, h.next_due_date, h.source,
         -- Daily/weekly cadences don't need a month-end anchor.
         case when h.frequency in ('monthly', 'quarterly', 'annual')
              then coalesce(h.anchor_date, h.next_due_date) else h.next_due_date end as anchor,
         (h.effective_at at time zone public.org_timezone(h.org_id))::date as start_on,
         (lead(h.effective_at) over (partition by h.pm_schedule_id order by h.effective_at, h.id)
            at time zone public.org_timezone(h.org_id))::date as end_on
    from public.pm_schedule_cadence_history h
   where h.deleted_at is null
),
expectation_bounds as (
  select e.*,
         -- The backfill record stands in for all unrecorded history, so its
         -- cycles count from its next due date; any later record only from
         -- the day it was made.
         case when e.source = 'backfill' then e.next_due_date
              else greatest(e.next_due_date, e.start_on) end as lo,
         least(coalesce(e.end_on, public.org_today(e.org_id)), public.org_today(e.org_id)) as hi
    from expectations e
   where e.next_due_date is not null
     and e.anchor is not null
),
expected_units as (
  select e.org_id, e.pm_schedule_id, c.d as due_on,
         sa.asset_id,
         coalesce(a.name, v.name, sa.asset_name) as asset_name
    from expectation_bounds e
    join public.pm_schedules s on s.id = e.pm_schedule_id
   cross join lateral generate_series(0, greatest(-1, (e.hi - e.anchor) / public.pm_cycle_min_days(e.frequency) + 1)) as k(k)
   cross join lateral (select public.pm_cycle_date(e.anchor, e.frequency, k.k) as d) c
    join public.pm_schedule_assets sa on sa.pm_schedule_id = e.pm_schedule_id and sa.deleted_at is null
    left join public.assets   a on a.id = sa.asset_id and a.deleted_at is null and a.status <> 'disposed'
    left join public.vehicles v on v.id = sa.asset_id and v.deleted_at is null and v.status <> 'disposed'
   where e.lo < e.hi
     and c.d >= e.lo
     and c.d <  e.hi
     -- The current expectation only for live schedules (as the old trail).
     and (e.end_on is not null or (s.deleted_at is null and s.is_active))
     and (a.id is not null or v.id is not null)
     and not public.pm_schedule_paused_on(e.pm_schedule_id, c.d)
     and not exists (
       select 1 from public.work_orders w
        where w.pm_schedule_id = e.pm_schedule_id
          and w.parent_work_order_id is null
          and w.deleted_at is null
          and w.due_date = c.d
     )
)
select source, program_id, program_name, work_order_id, work_order_number,
       org_id, asset_id, asset_name, status, due_date, due_on, completed_at,
       (completed_at at time zone public.org_timezone(org_id))::date as completed_on,
       case
         when status = 'done' and has_due
              and (completed_at at time zone public.org_timezone(org_id))::date > due_on then 'late'
         when status = 'done' and has_due                                   then 'on_time'
         when status = 'done'                                               then 'completed'
         when status = 'skipped'                                            then 'skipped'
         when has_due and due_on < public.org_today(org_id)                 then 'overdue'
         else 'pending'
       end as outcome
  from wo_units
union all
select 'schedule', g.pm_schedule_id, s.title, null::uuid, null::text,
       g.org_id, g.asset_id, g.asset_name, null::text, null::date, g.due_on,
       null::timestamptz, null::date, 'not_generated'
  from (select * from legacy_gap_units union all select * from expected_units) g
  join public.pm_schedules s on s.id = g.pm_schedule_id
union all
-- Meter alerts nobody turned into a work order, past their 7 days.
select 'meter', a.id, a.name, null::uuid, null::text,
       r.org_id, r.asset_id, r.asset_name, r.status, null::date,
       (r.created_at at time zone public.org_timezone(r.org_id))::date + 7,
       null::timestamptz, null::date, 'not_generated'
  from public.maintenance_requests r
  join public.automations a on a.id = r.automation_id and a.trigger_type = 'meter_threshold'
 where r.deleted_at is null
   and r.linked_work_order_id is null
   and r.status in ('open', 'in_review', 'approved')
   and (r.created_at at time zone public.org_timezone(r.org_id))::date + 7 < public.org_today(r.org_id);

revoke all on public.v_pm_outcomes from anon;
grant select on public.v_pm_outcomes to authenticated;

comment on view public.v_pm_outcomes is
  'PM compliance units. Missed (not_generated) cycles are scored against the expectation recorded in pm_schedule_cadence_history when each cycle came due; see 20260928130000 for the rule.';
