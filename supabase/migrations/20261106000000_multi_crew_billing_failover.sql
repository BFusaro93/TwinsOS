-- Multi-crew billing failover (follow-up to 20261029000000_multi_crew_visits.sql).
--
-- Fixes:
--  1. A lead visit that is SKIPPED or CANCELLED while a sibling is still live
--     used to keep the lead flag, so the stop never billed once a secondary
--     completed. The lead role now fails over on those status changes too.
--  2. Failover prefers a sibling that hasn't completed yet (it will still run
--     the auto-invoice step when it does). crm_remove_visit_crew refuses to
--     remove a lead while a sibling has already completed, so a completed
--     sibling is never silently promoted into an unbilled lead.
--  3. The "group of <= 1 dissolves to a plain visit" rule now lives in the
--     trigger, so it holds for every soft-delete path (job prune, delete visit,
--     RPC), clearing the survivor's stale Lead badge.
--
-- Restates crm_job_visits_group_lead_failover and crm_remove_visit_crew in
-- full (latest definitions of both were in 20261029000000). Idempotent.

create or replace function public.crm_job_visits_group_lead_failover()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_was_lead  boolean := not new.crew_group_secondary;
  v_removed   boolean := old.deleted_at is null and new.deleted_at is not null;
  v_succ      uuid;
  v_live      integer;
begin
  if new.crew_group_id is null then
    return null;
  end if;

  if v_was_lead then
    -- Prefer a live sibling that can still bill: not skipped/cancelled, and not
    -- already completed. On a delete, fall back to completed, then to any live
    -- sibling, so a stop never ends up with no lead. A skip/cancel only hands
    -- over to a sibling that is itself still in play.
    select g.id into v_succ
      from crm_job_visits g
     where g.crew_group_id = new.crew_group_id
       and g.id <> new.id
       and g.deleted_at is null
       and (v_removed or g.status not in ('skipped', 'cancelled'))
     order by (g.status in ('skipped', 'cancelled')),
              (g.status = 'completed'),
              g.created_at, g.id
     limit 1;

    if v_succ is not null then
      if not v_removed then
        -- Demote the skipped/cancelled lead first (one lead per group).
        update crm_job_visits set crew_group_secondary = true where id = new.id;
      end if;
      update crm_job_visits set crew_group_secondary = false where id = v_succ;
    end if;
  end if;

  -- A group left with a single live visit dissolves to a plain visit.
  if v_removed then
    select count(*) into v_live from crm_job_visits
     where crew_group_id = new.crew_group_id and deleted_at is null;
    if v_live <= 1 then
      update crm_job_visits
         set crew_group_id = null, crew_group_secondary = false
       where crew_group_id = new.crew_group_id and deleted_at is null;
    end if;
  end if;

  return null;
end;
$$;
revoke execute on function public.crm_job_visits_group_lead_failover() from public, anon, authenticated;

drop trigger if exists trg_crm_job_visits_group_lead_failover on public.crm_job_visits;
create trigger trg_crm_job_visits_group_lead_failover
  after update of deleted_at, status on public.crm_job_visits
  for each row
  when (new.crew_group_id is not null
        and ((old.deleted_at is null and new.deleted_at is not null)
             or (not new.crew_group_secondary
                 and new.deleted_at is null
                 and new.status in ('skipped', 'cancelled')
                 and old.status is distinct from new.status)))
  execute function public.crm_job_visits_group_lead_failover();

create or replace function public.crm_remove_visit_crew(p_visit_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_org  uuid := my_org_id();
  v      crm_job_visits%rowtype;
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
  -- A completed sibling would inherit the lead role without ever running the
  -- auto-invoice step, leaving the stop unbilled.
  if not v.crew_group_secondary and exists (
    select 1 from crm_job_visits g
     where g.crew_group_id = v.crew_group_id and g.id <> v.id
       and g.deleted_at is null and g.status = 'completed'
  ) then
    raise exception 'The lead crew can''t be removed after another crew has completed its work on this stop — the stop would not be billed. Remove the other crew instead, or complete the lead visit.';
  end if;

  -- The failover trigger hands over the lead role and dissolves a group left
  -- with a single visit.
  update crm_job_visits set deleted_at = now() where id = v.id;
end;
$$;
revoke execute on function public.crm_remove_visit_crew(uuid) from public, anon;
grant execute on function public.crm_remove_visit_crew(uuid) to authenticated;
