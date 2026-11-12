-- Multi-asset PM batches close themselves when their last asset WO closes.
--
-- Generating a multi-asset PM schedule creates a parent ("master") work order
-- plus one sub-work order per asset. Crews close the sub-WOs, but nothing ever
-- closed the parent. A forgotten parent then:
--   * blocked the next generation (the route's duplicate guard and the unique
--     index work_orders_pm_schedule_open_batch_unique both treat an open
--     parent as an open batch), and
--   * silenced the PM Schedule Due email (pm-due-notify skips schedules that
--     still have an open work order).
--
-- 1. work_orders_close_finished_pm_batch (AFTER UPDATE OF status, deleted_at):
--    when a sub-WO of a PM batch is completed, skipped or deleted and no live
--    sub-WO is left open, the parent is completed — 'done' when at least one
--    asset was done, 'skipped' when every asset was skipped. completed_at is
--    stamped by trg_work_orders_stamp_completed_at. The parent row is locked
--    first, so two sub-WOs closing at the same moment can't both miss it.
-- 2. work_orders_sync_pm_last_completed ignores a batch parent: its sub-WOs
--    already record their own completion dates, and the parent closing later
--    (or being repaired below) must not move "last completed" to that day.
-- 3. One-time repair of parents that are already stuck this way.
--
-- Replaces work_orders_sync_pm_last_completed() — live body (org-timezone
-- version of 20260929110000); only the batch-parent early return is added.

create or replace function public.work_orders_close_finished_pm_batch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_parent  public.work_orders%rowtype;
  v_live    integer;
  v_open    integer;
  v_done    integer;
begin
  if new.parent_work_order_id is null then
    return new;
  end if;
  -- Only when this sub-WO just closed or was removed.
  if not (
       (new.deleted_at is null
        and new.status in ('done', 'skipped')
        and old.status is distinct from new.status)
    or (new.deleted_at is not null and old.deleted_at is null)
  ) then
    return new;
  end if;

  select * into v_parent
    from public.work_orders
   where id = new.parent_work_order_id
   for update;
  if not found
     or v_parent.deleted_at is not null
     or v_parent.pm_schedule_id is null
     or v_parent.status in ('done', 'skipped') then
    return new;
  end if;

  select count(*),
         count(*) filter (where c.status not in ('done', 'skipped')),
         count(*) filter (where c.status = 'done')
    into v_live, v_open, v_done
    from public.work_orders c
   where c.parent_work_order_id = v_parent.id
     and c.deleted_at is null;

  if v_live = 0 or v_open > 0 then
    return new;
  end if;

  update public.work_orders
     set status = case when v_done > 0 then 'done' else 'skipped' end
   where id = v_parent.id;

  return new;
end;
$function$;

revoke all on function public.work_orders_close_finished_pm_batch() from public, anon, authenticated;

drop trigger if exists trg_work_orders_close_finished_pm_batch on public.work_orders;
create trigger trg_work_orders_close_finished_pm_batch
  after update of status, deleted_at on public.work_orders
  for each row execute function public.work_orders_close_finished_pm_batch();


create or replace function public.work_orders_sync_pm_last_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_date date;
begin
  if new.pm_schedule_id is null or new.status <> 'done' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'done' then
    return new;
  end if;
  -- A multi-asset batch parent: its sub-WOs record their own completion.
  if exists (select 1 from public.work_orders c
              where c.parent_work_order_id = new.id and c.deleted_at is null) then
    return new;
  end if;

  -- Org-local calendar date of completion (completed_at is stamped by the
  -- BEFORE trigger trg_work_orders_stamp_completed_at).
  v_date := (coalesce(new.completed_at, now()) at time zone public.org_timezone(new.org_id))::date;

  update public.pm_schedules
     set last_completed_date = greatest(coalesce(last_completed_date, v_date), v_date)
   where id = new.pm_schedule_id
     and org_id = new.org_id;

  return new;
end;
$function$;

revoke all on function public.work_orders_sync_pm_last_completed() from public, anon, authenticated;


-- One-time repair: close PM batch parents whose live sub-WOs are all closed.
-- completed_at is then set to the last sub-WO's completion (a second update
-- that doesn't touch status, so the stamp trigger leaves it alone).
do $repair$
declare
  v_ids uuid[];
begin
  with stuck as (
    select p.id,
           exists (select 1 from public.work_orders c
                    where c.parent_work_order_id = p.id and c.deleted_at is null
                      and c.status = 'done') as any_done
      from public.work_orders p
     where p.pm_schedule_id is not null
       and p.parent_work_order_id is null
       and p.deleted_at is null
       and p.status not in ('done', 'skipped')
       and exists (select 1 from public.work_orders c
                    where c.parent_work_order_id = p.id and c.deleted_at is null)
       and not exists (select 1 from public.work_orders c
                        where c.parent_work_order_id = p.id and c.deleted_at is null
                          and c.status not in ('done', 'skipped'))
  ), closed as (
    update public.work_orders w
       set status = case when s.any_done then 'done' else 'skipped' end
      from stuck s
     where w.id = s.id
    returning w.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from closed;

  update public.work_orders w
     set completed_at = (select max(c.completed_at) from public.work_orders c
                          where c.parent_work_order_id = w.id and c.deleted_at is null)
   where w.id = any (v_ids)
     and w.status = 'done'
     and exists (select 1 from public.work_orders c
                  where c.parent_work_order_id = w.id and c.deleted_at is null
                    and c.completed_at is not null);

  raise notice 'Closed % stuck PM batch parent work order(s)', coalesce(array_length(v_ids, 1), 0);
end;
$repair$;
