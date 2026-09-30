-- Recurring work orders: generate the next occurrence on completion.
--
-- NewWorkOrderDialog has always offered "Recurrence" (daily … yearly) and
-- promised "a new work order will be generated automatically at this
-- interval once the current one is marked done", storing is_recurring +
-- recurrence_frequency — but nothing ever created the next work order.
--
-- Done as an AFTER UPDATE trigger (not in the status hook) so every
-- completion path — web UI, public v1 API, crew app, automations — spawns
-- the next occurrence exactly the same way.
--
-- Rules:
--   * Fires only when a live (deleted_at is null), top-level
--     (parent_work_order_id is null), non-PM (pm_schedule_id is null — PM
--     schedules have their own generator) work order with is_recurring and a
--     recurrence_frequency transitions INTO 'done'.
--   * A work order gets at most one successor, ever: the successor points
--     back via recurrence_parent_id, and the trigger skips when any row
--     (live or soft-deleted) already points at it. So done → reopen → done
--     never spawns twice, and deleting the generated successor doesn't make
--     a later re-completion bring it back. The unique partial index below is
--     the concurrency backstop.
--   * Turning recurrence off (is_recurring false / frequency null) before
--     completing stops the series.
--   * Next due date = previous due_date (or the org-local completion date
--     when there was none) + the interval. The scheduled (start) date, if
--     any, advances by the same interval and is clamped to the due date.
--   * Sub-work orders (a multi-asset recurring WO) recur with their parent:
--     every live sub-WO is copied under the new parent with the same date
--     shift. A sub-WO never spawns on its own.
--   * Copied: title, description, priority, type, categories, asset/vehicle,
--     assignees, recurrence settings, creator. NOT copied: parts, labor,
--     vendor charges (wo_parts deducts stock on insert, so a parts template
--     would consume inventory weeks before the work happens), automation /
--     PM links, completion stamps.
--   * Numbers come from the same atomic per-org/year counter as
--     next_work_order_number(), keyed on the work order's own org (the
--     trigger may run as a service-role caller with no profile, or a staff
--     user impersonating the org).
--
-- SECURITY DEFINER: the insert bypasses the role-based write guards on
-- work_orders (the completer may be a crew / limited role allowed to update
-- status but not to create WOs). The audit trigger fires normally on the
-- inserted rows. In-app / email "new work order" notifications are sent
-- client-side on create, so trigger-created occurrences don't notify.

alter table public.work_orders
  add column if not exists recurrence_parent_id uuid references public.work_orders(id);

comment on column public.work_orders.recurrence_parent_id is
  'The recurring work order whose completion generated this one (see work_orders_spawn_next_recurrence).';

create unique index if not exists work_orders_recurrence_parent_unique
  on public.work_orders (recurrence_parent_id)
  where deleted_at is null;

-- ── helpers ────────────────────────────────────────────────────────────────

create or replace function public.wo_recurrence_advance(p_date date, p_frequency text)
returns date
language sql
immutable
set search_path to 'public'
as $$
  select case p_frequency
    when 'daily'     then p_date + 1
    when 'weekly'    then p_date + 7
    when 'biweekly'  then p_date + 14
    when 'monthly'   then (p_date + interval '1 month')::date
    when 'quarterly' then (p_date + interval '3 months')::date
    when 'yearly'    then (p_date + interval '1 year')::date
    else null
  end;
$$;

-- Same counter / format as next_entity_number('work_order', 'WO'), but for an
-- explicit org — internal to the trigger, not callable by end users.
create or replace function public._next_work_order_number_for_org(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_year  text := to_char(now(), 'YYYY');
  v_count int;
begin
  insert into public.entity_number_counters (org_id, entity_type, period, count)
  values (p_org_id, 'work_order', v_year, 1)
  on conflict (org_id, entity_type, period)
    do update set count = public.entity_number_counters.count + 1
  returning count into v_count;

  return 'WO-' || v_year || '-' || lpad(v_count::text, 6, '0');
end;
$$;

revoke all on function public._next_work_order_number_for_org(uuid) from public, anon, authenticated;

-- Inserts one open copy of p_src, shifted to the given dates, and returns its
-- id (null when a live successor already exists — the unique index races).
create or replace function public._wo_recurrence_copy(
  p_src public.work_orders,
  p_parent_id uuid,
  p_due date,
  p_start date
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  insert into public.work_orders (
    org_id, created_by, work_order_number, title, description, status,
    priority, wo_type, asset_id, asset_name, linked_entity_type,
    assigned_to_id, assigned_to_name, assigned_to_ids, assigned_to_names,
    start_date, due_date, category, categories,
    parent_work_order_id, is_recurring, recurrence_frequency,
    recurrence_parent_id
  ) values (
    p_src.org_id, p_src.created_by, public._next_work_order_number_for_org(p_src.org_id),
    p_src.title, p_src.description, 'open',
    p_src.priority, p_src.wo_type, p_src.asset_id, p_src.asset_name, p_src.linked_entity_type,
    p_src.assigned_to_id, p_src.assigned_to_name,
    coalesce(p_src.assigned_to_ids, '[]'::jsonb), coalesce(p_src.assigned_to_names, '[]'::jsonb),
    p_start, p_due, p_src.category, coalesce(p_src.categories, '[]'::jsonb),
    p_parent_id, p_src.is_recurring, p_src.recurrence_frequency,
    p_src.id
  )
  on conflict (recurrence_parent_id) where deleted_at is null do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public._wo_recurrence_copy(public.work_orders, uuid, date, date) from public, anon, authenticated;

-- ── trigger ────────────────────────────────────────────────────────────────

create or replace function public.work_orders_spawn_next_recurrence()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_done_date  date;
  v_base       date;
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
  v_base      := coalesce(new.due_date, v_done_date);
  v_next_due  := public.wo_recurrence_advance(v_base, new.recurrence_frequency);
  if v_next_due is null then
    return new;
  end if;
  v_next_start := case when new.start_date is not null
                    then least(public.wo_recurrence_advance(new.start_date::date, new.recurrence_frequency), v_next_due)
                  end;

  v_new_id := public._wo_recurrence_copy(new, null, v_next_due, v_next_start);
  if v_new_id is null then
    return new;
  end if;

  -- Multi-asset recurring WO: its sub-work orders recur with it.
  for v_sub in
    select * from public.work_orders s
     where s.parent_work_order_id = new.id
       and s.deleted_at is null
     order by s.created_at
  loop
    v_sub_due := case when v_sub.due_date is not null
                   then public.wo_recurrence_advance(v_sub.due_date, new.recurrence_frequency)
                   else v_next_due
                 end;
    v_sub_start := case when v_sub.start_date is not null
                     then least(public.wo_recurrence_advance(v_sub.start_date::date, new.recurrence_frequency), v_sub_due)
                   end;
    perform public._wo_recurrence_copy(v_sub, v_new_id, v_sub_due, v_sub_start);
  end loop;

  return new;
end;
$$;

revoke all on function public.work_orders_spawn_next_recurrence() from public, anon, authenticated;

drop trigger if exists trg_work_orders_spawn_next_recurrence on public.work_orders;
create trigger trg_work_orders_spawn_next_recurrence
  after update of status on public.work_orders
  for each row execute function public.work_orders_spawn_next_recurrence();
