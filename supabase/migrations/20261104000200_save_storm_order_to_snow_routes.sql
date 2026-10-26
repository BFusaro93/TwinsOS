-- Saves the stop order a dispatcher built on a storm back onto the Master
-- Routes, so the next storm comes up in the same sequence.
--
-- Per crew on the storm (effective crew = visit crew, else the job's crew,
-- unless the visit is pinned unassigned): the crew's route is the active
-- Master Route whose default crew is that crew (created, named after the
-- crew, if none exists). The storm's jobs take over the slots they already
-- hold on that route, in the storm's order; jobs not on the route yet are
-- appended; route stops that weren't part of this storm keep their slots, so
-- a property skipped this storm doesn't lose its place. A job may sit on one
-- route only (crm_snow_route_stops_job_unique), so a job moved between crews
-- is re-homed to the new crew's route.
--
-- SECURITY INVOKER: every read/write is under the caller's RLS.

create or replace function public.save_storm_order_to_snow_routes(p_storm_event_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_crew      record;
  v_route_id  uuid;
  v_existing  uuid[];
  v_storm     uuid[];
  v_in_route  uuid[];
  v_new       uuid[];
  v_slots     integer[];
  v_i         integer;
  v_k         integer;
  v_saved     integer := 0;
  v_job       uuid;
begin
  if not exists (select 1 from crm_storm_events where id = p_storm_event_id and deleted_at is null) then
    raise exception 'Storm event not found';
  end if;

  for v_crew in
    select eff.crew_id, c.name as crew_name, c.org_id as crew_org_id
      from (
        select distinct
               case when v.crew_unassigned then null else coalesce(v.crew_id, j.crew_id) end as crew_id
          from crm_job_visits v
          join crm_jobs j on j.id = v.job_id
         where v.storm_event_id = p_storm_event_id and v.deleted_at is null
      ) eff
      join crm_crews c on c.id = eff.crew_id
     where eff.crew_id is not null
  loop
    -- This crew's jobs in storm order (first visit wins for a repeated job).
    select coalesce(array_agg(job_id order by first_ord), '{}')
      into v_storm
      from (
        select v.job_id, min(coalesce(v.order_num, 2147483647)) as first_ord
          from crm_job_visits v
          join crm_jobs j on j.id = v.job_id
         where v.storm_event_id = p_storm_event_id and v.deleted_at is null
           and case when v.crew_unassigned then null else coalesce(v.crew_id, j.crew_id) end = v_crew.crew_id
         group by v.job_id
      ) s;

    if coalesce(array_length(v_storm, 1), 0) = 0 then continue; end if;

    select id into v_route_id
      from crm_snow_routes
     where default_crew_id = v_crew.crew_id and deleted_at is null and is_active
     order by created_at
     limit 1;

    if v_route_id is null then
      insert into crm_snow_routes (org_id, name, default_crew_id)
      values (v_crew.crew_org_id, v_crew.crew_name, v_crew.crew_id)
      returning id into v_route_id;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_route_id::text, 0));

    select coalesce(array_agg(job_id order by sort_order, created_at), '{}')
      into v_existing
      from crm_snow_route_stops where route_id = v_route_id;

    -- Storm jobs already on the route, in storm order.
    select coalesce(array_agg(x order by ord), '{}') into v_in_route
      from unnest(v_storm) with ordinality as t(x, ord)
     where x = any(v_existing);

    v_new := v_existing;
    v_k := 1;
    for v_i in 1 .. coalesce(array_length(v_existing, 1), 0) loop
      if v_existing[v_i] = any(v_storm) then
        v_new[v_i] := v_in_route[v_k];
        v_k := v_k + 1;
      end if;
    end loop;
    -- Jobs new to this route go on the end, in storm order.
    for v_job in select x from unnest(v_storm) with ordinality as t(x, ord) order by ord loop
      if not (v_job = any(v_existing)) then
        v_new := v_new || v_job;
      end if;
    end loop;

    -- Rows being re-homed from another route keep their unique job_id, so
    -- upsert on job_id.
    for v_i in 1 .. array_length(v_new, 1) loop
      insert into crm_snow_route_stops (org_id, route_id, job_id, sort_order)
      values (v_crew.crew_org_id, v_route_id, v_new[v_i], v_i - 1)
      on conflict (job_id) do update
        set route_id = excluded.route_id, sort_order = excluded.sort_order;
    end loop;

    v_saved := v_saved + coalesce(array_length(v_storm, 1), 0);
  end loop;

  return v_saved;
end;
$$;

revoke all on function public.save_storm_order_to_snow_routes(uuid) from public, anon;
grant execute on function public.save_storm_order_to_snow_routes(uuid) to authenticated;
