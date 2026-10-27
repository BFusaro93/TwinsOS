-- Recurring work orders follow a fixed calendar and never drift.
--
-- work_orders_spawn_next_recurrence used previous due date + one interval:
--   * a WO completed late (due the 1st, done the 20th) spawned a successor
--     already overdue (due the 1st of next month is fine, but weekly/daily
--     chains spawned successors due in the past);
--   * monthly chains drifted after day-clamping (Jan 31 -> Feb 28 -> Mar 28).
--
-- Now the next due date comes from the chain's ORIGINAL anchor (the due date
-- of the oldest WO in the recurrence_parent_id chain): occurrence k is
-- anchor + k * interval computed from the anchor each time, so the 31st stays
-- the 31st clamped per month. The successor is the first occurrence strictly
-- after this WO's due date that is not already in the past on the org's day
-- (org_today) — missed occurrences are skipped instead of spawning an instantly
-- overdue WO. Late completion therefore never moves the schedule.
--
-- If this WO's due date is NOT on the anchor cadence (someone deliberately
-- re-dated it), that edit is honoured: the cadence re-anchors on this WO.
-- A WO with no due date anchors on its (org-local) completion date.
-- Start dates keep their original lead time before the due date; sub-work
-- orders keep their own offset from the parent's due date.

create or replace function public.wo_recurrence_occurrence(p_anchor date, p_frequency text, p_k integer)
returns date
language sql
immutable
set search_path to 'public'
as $function$
  select case p_frequency
    when 'daily'     then p_anchor + p_k
    when 'weekly'    then p_anchor + 7 * p_k
    when 'biweekly'  then p_anchor + 14 * p_k
    when 'monthly'   then (p_anchor + (interval '1 month' * p_k))::date
    when 'quarterly' then (p_anchor + (interval '3 months' * p_k))::date
    when 'yearly'    then (p_anchor + (interval '1 year' * p_k))::date
    else null
  end;
$function$;

create or replace function public.wo_recurrence_next_due(
  p_anchor date, p_frequency text, p_after date, p_not_before date
)
returns date
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_k    integer := 0;
  v_occ  date;
begin
  if public.wo_recurrence_occurrence(p_anchor, p_frequency, 1) is null then
    return null;
  end if;
  -- v_k = index of the first occurrence on/after p_after; if it IS p_after the
  -- WO sits on the cadence, otherwise it was deliberately re-dated.
  loop
    v_occ := public.wo_recurrence_occurrence(p_anchor, p_frequency, v_k);
    exit when v_occ >= p_after or v_k > 5000;
    v_k := v_k + 1;
  end loop;
  if v_occ <> p_after then
    p_anchor := p_after;
    v_k := 0;
  end if;
  v_k := v_k + 1;
  loop
    v_occ := public.wo_recurrence_occurrence(p_anchor, p_frequency, v_k);
    exit when (v_occ > p_after and v_occ >= p_not_before) or v_k > 5000;
    v_k := v_k + 1;
  end loop;
  return v_occ;
end;
$function$;

create or replace function public.work_orders_spawn_next_recurrence()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_done_date  date;
  v_today      date;
  v_base       date;
  v_anchor     date;
  v_next_due   date;
  v_next_start date;
  v_new_id     uuid;
  v_sub        public.work_orders;
  v_sub_due    date;
  v_sub_start  date;
begin
  if new.status is distinct from 'done' or old.status is not distinct from 'done' then
    return new;
  end if;
  if new.deleted_at is not null
     or not coalesce(new.is_recurring, false)
     or new.recurrence_frequency is null
     or new.parent_work_order_id is not null
     or new.pm_schedule_id is not null then
    return new;
  end if;
  -- At most one successor per work order, ever (including soft-deleted).
  if exists (select 1 from public.work_orders w where w.recurrence_parent_id = new.id) then
    return new;
  end if;

  -- Org-local completion date (completed_at is stamped by the BEFORE trigger
  -- trg_work_orders_stamp_completed_at).
  v_done_date := (coalesce(new.completed_at, now()) at time zone public.org_timezone(new.org_id))::date;
  v_today     := public.org_today(new.org_id);
  v_base      := coalesce(new.due_date, v_done_date);

  -- Original anchor: due date of the oldest WO in this chain (deleted
  -- ancestors included) that has one; this WO's own base when none does.
  with recursive chain as (
    select w.id, w.recurrence_parent_id, w.due_date, 0 as depth
      from public.work_orders w where w.id = new.id
    union all
    select w.id, w.recurrence_parent_id, w.due_date, c.depth + 1
      from public.work_orders w
      join chain c on w.id = c.recurrence_parent_id
     where c.depth < 1000
  )
  select due_date into v_anchor
    from chain where due_date is not null
   order by depth desc limit 1;
  v_anchor := coalesce(v_anchor, v_base);

  v_next_due := public.wo_recurrence_next_due(v_anchor, new.recurrence_frequency, v_base, v_today);
  if v_next_due is null then
    return new;
  end if;
  v_next_start := case
    when new.start_date is not null and new.due_date is not null
      then v_next_due - greatest(0, new.due_date - new.start_date::date)
    when new.start_date is not null
      then least(public.wo_recurrence_advance(new.start_date::date, new.recurrence_frequency), v_next_due)
  end;

  v_new_id := public._wo_recurrence_copy(new, null, v_next_due, v_next_start);
  if v_new_id is null then
    return new;
  end if;

  -- Multi-asset recurring WO: its sub-work orders recur with it, keeping
  -- their own offset from the parent's due date.
  for v_sub in
    select * from public.work_orders s
     where s.parent_work_order_id = new.id
       and s.deleted_at is null
     order by s.created_at
  loop
    v_sub_due := case when v_sub.due_date is not null and new.due_date is not null
                   then v_next_due + (v_sub.due_date - new.due_date)
                 else v_next_due
                 end;
    v_sub_start := case when v_sub.start_date is not null
                     then least(v_sub_due - greatest(0, coalesce(v_sub.due_date, v_sub_due) - v_sub.start_date::date), v_sub_due)
                   end;
    perform public._wo_recurrence_copy(v_sub, v_new_id, v_sub_due, v_sub_start);
  end loop;

  return new;
end;
$function$;
