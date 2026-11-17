-- "Permanent" crew assignment from the snow dispatch board (Service Autopilot's
-- Permanent checkbox): putting stops on a crew for good means putting their
-- jobs on that crew's Master Route, so every later storm picks the crew up
-- from the route (useAddJobsToStormEvent falls back to the job's Master Route
-- crew) instead of the dispatcher re-assigning each storm.
--
-- p_crew_id = the crew; p_route_id = which of the crew's Master Routes. A crew
-- often has several (e.g. one for plowing, one for salting, since some storms
-- only salt), so the caller names the route. Without p_route_id the crew's
-- earliest active route is used (created, named after the crew, if the crew
-- has none), and a job already on ANY of the crew's routes keeps its slot.
-- With p_route_id, a job already on that route keeps its slot and every other
-- job (even one on the crew's other route) moves to the end of it. A job sits
-- on one route only (crm_snow_route_stops_job_unique), so a job on another
-- crew's route is re-homed.
-- p_crew_id = null: the jobs come off their Master Routes, so later storms
-- no longer pre-assign them.
--
-- Returns how many jobs were placed (or removed). SECURITY INVOKER: every read
-- and write is under the caller's RLS.

create or replace function public.assign_jobs_to_snow_route_crew(p_job_ids uuid[], p_crew_id uuid, p_route_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_route_id  uuid;
  v_org_id    uuid;
  v_crew_name text;
  v_next      integer;
  v_job       uuid;
  v_count     integer := 0;
begin
  if p_job_ids is null or coalesce(array_length(p_job_ids, 1), 0) = 0 then
    return 0;
  end if;

  if p_crew_id is null then
    delete from crm_snow_route_stops where job_id = any (p_job_ids);
    get diagnostics v_count = row_count;
    return v_count;
  end if;

  select org_id, name into v_org_id, v_crew_name
    from crm_crews where id = p_crew_id and deleted_at is null;
  if v_org_id is null then
    raise exception 'Crew not found';
  end if;

  if p_route_id is not null then
    select id into v_route_id
      from crm_snow_routes
     where id = p_route_id and default_crew_id = p_crew_id and deleted_at is null and is_active;
    if v_route_id is null then
      raise exception 'That Master Route does not belong to the crew';
    end if;
  else
    select id into v_route_id
      from crm_snow_routes
     where default_crew_id = p_crew_id and deleted_at is null and is_active
     order by created_at
     limit 1;
  end if;

  if v_route_id is null then
    insert into crm_snow_routes (org_id, name, default_crew_id)
    values (v_org_id, v_crew_name, p_crew_id)
    returning id into v_route_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_route_id::text, 0));

  select coalesce(max(sort_order), -1) + 1 into v_next
    from crm_snow_route_stops where route_id = v_route_id;

  -- Selection order is kept for the jobs that are new to this route.
  for v_job in
    select j
      from (
        select j, min(ord) as first_ord
          from unnest(p_job_ids) with ordinality as t(j, ord)
         group by j
      ) d
     order by first_ord
  loop
    -- Already where it should be: leave its slot alone. With a named route that is
    -- that route; otherwise any of the crew's routes.
    if exists (
      select 1
        from crm_snow_route_stops s
        join crm_snow_routes r on r.id = s.route_id
       where s.job_id = v_job
         and case when p_route_id is not null
                  then s.route_id = v_route_id
                  else r.default_crew_id = p_crew_id and r.deleted_at is null and r.is_active end
    ) then
      v_count := v_count + 1;
      continue;
    end if;
    insert into crm_snow_route_stops (org_id, route_id, job_id, sort_order)
    values (v_org_id, v_route_id, v_job, v_next)
    on conflict (job_id) do update
      set route_id = excluded.route_id, sort_order = excluded.sort_order;
    v_next := v_next + 1;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.assign_jobs_to_snow_route_crew(uuid[], uuid, uuid) from public, anon;
grant execute on function public.assign_jobs_to_snow_route_crew(uuid[], uuid, uuid) to authenticated;
