-- A skipped recurring work order still schedules the next one.
--
-- Skip is now offered on top-level recurring work orders (and single-asset PM
-- work orders), not only on sub-work orders. trg_work_orders_spawn_next_recurrence
-- only fired on 'done', so skipping an occurrence ended the recurrence for
-- good. It now fires on 'skipped' as well; the next occurrence is placed on
-- the same fixed calendar as a completed one (from the skipped WO's due date),
-- and the existing "at most one successor per work order, ever" rule means
-- skipping, reopening and then completing it never makes a second successor.
--
-- Replaces work_orders_spawn_next_recurrence() — latest
-- 20261111040100_recurring_wo_fixed_calendar (identical to the live body);
-- only the opening status test changes.

CREATE OR REPLACE FUNCTION public.work_orders_spawn_next_recurrence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Done or skipped, and only on the transition into it (done <-> skipped
  -- moves don't count; the successor guard below covers re-closing).
  if new.status not in ('done', 'skipped')
     or old.status in ('done', 'skipped') then
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
$function$
;

revoke all on function public.work_orders_spawn_next_recurrence() from public, anon, authenticated;
