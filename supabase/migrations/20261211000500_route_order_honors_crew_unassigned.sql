-- Sticky route order remembered a visit pinned to "no crew" (crm_job_visits.crew_unassigned,
-- added after this RPC was written) against the JOB's crew's weekday route. Resolve the crew
-- the way the board does: an unassigned visit has no crew and is not remembered. Body is
-- 20260910120000 otherwise unchanged (search_path pinned).
create or replace function public.crm_save_route_order(p_visit_ids uuid[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_org      uuid := my_org_id();
  v_priority integer;
  v_memory   integer;
begin
  if v_org is null then
    raise exception 'crm_save_route_order: no org for current user';
  end if;
  if p_visit_ids is null or cardinality(p_visit_ids) = 0 then
    return 0;
  end if;

  with ordered as (
    select id, ordinality::integer as pos
    from unnest(p_visit_ids) with ordinality as t(id, ordinality)
  )
  update crm_job_visits v
  set priority = o.pos
  from ordered o
  where v.id = o.id
    and v.org_id = v_org
    and v.priority is distinct from o.pos;
  get diagnostics v_priority = row_count;

  -- The board treats a visit's own crew as an override of its job's crew;
  -- mirror that here or a per-day crew swap would be remembered against the
  -- wrong route. Visits with no crew at all are skipped — "unassigned" is not
  -- a route worth remembering.
  with ordered as (
    select id, ordinality::integer as pos
    from unnest(p_visit_ids) with ordinality as t(id, ordinality)
  ),
  resolved as (
    select
      case when v.crew_unassigned then null else coalesce(v.crew_id, j.crew_id) end                as crew_id,
      extract(dow from v.scheduled_date)::smallint  as day_of_week,
      v.job_id,
      o.pos,
      row_number() over (
        partition by case when v.crew_unassigned then null else coalesce(v.crew_id, j.crew_id) end, extract(dow from v.scheduled_date)
        order by o.pos
      )::integer as crew_pos
    from ordered o
    join crm_job_visits v on v.id = o.id
    join crm_jobs j on j.id = v.job_id
    where v.org_id = v_org
      and v.deleted_at is null
      and v.scheduled_date is not null
      and case when v.crew_unassigned then null else coalesce(v.crew_id, j.crew_id) end is not null
  ),
  -- One row per (crew, weekday, job): a job with two visits the same day (a
  -- multi-service stop) would otherwise violate the unique constraint. Keep
  -- its earliest position — that is where the stop actually sits on the route.
  deduped as (
    select distinct on (crew_id, day_of_week, job_id)
      crew_id, day_of_week, job_id, crew_pos
    from resolved
    order by crew_id, day_of_week, job_id, crew_pos
  )
  insert into crm_crew_route_order (org_id, crew_id, day_of_week, job_id, position, updated_by)
  select v_org, d.crew_id, d.day_of_week, d.job_id, d.crew_pos, auth.uid()
  from deduped d
  on conflict (crew_id, day_of_week, job_id)
  do update set position = excluded.position,
                updated_at = now(),
                updated_by = excluded.updated_by;
  get diagnostics v_memory = row_count;

  return v_priority + v_memory;
end;
$$;


