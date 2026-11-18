-- Master Routes that span crews (Service Autopilot style: one "All Plow Jobs"
-- route and one "All Salt Jobs" route, with the crew grouping kept on the stops).
--
-- Until now a stop's crew could only come from the route's default crew, so
-- the only way to remember "Crew 1 does these, Crew 2 does those" was one
-- route per crew. crm_snow_route_stops.crew_id puts the crew on the stop:
--   effective stop crew = coalesce(stop.crew_id, route.default_crew_id)
-- A route with no default crew is a shared route; a route with one behaves
-- exactly as before (stop.crew_id null = the default crew).
--
-- A job is still on one route at most (crm_snow_route_stops_job_unique). That
-- is fine for plow/salt routes because plowing and salting are separate snow
-- jobs, not two services on one job.

alter table public.crm_snow_route_stops
  add column if not exists crew_id uuid references public.crm_crews(id);

create index if not exists crm_snow_route_stops_crew_idx
  on public.crm_snow_route_stops (crew_id) where crew_id is not null;

-- A stop's crew must belong to the stop's own org (RLS only checks org_id).
create or replace function public.crm_snow_route_stops_crew_org_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.crew_id is not null
     and not exists (select 1 from crm_crews c where c.id = new.crew_id and c.org_id = new.org_id) then
    raise exception 'Crew does not belong to this organization';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_snow_route_stops_crew_org on public.crm_snow_route_stops;
create trigger trg_crm_snow_route_stops_crew_org
  before insert or update of crew_id, org_id on public.crm_snow_route_stops
  for each row execute function public.crm_snow_route_stops_crew_org_guard();

-- ── Storm → route targets ───────────────────────────────────────────────────
-- Each job on the storm with its effective storm crew, its order on the storm
-- and the route it belongs to: the active route it is already a stop on, else
-- (per-crew routes) the crew's earliest active default-crew route.
-- SECURITY INVOKER: every read is under the caller's RLS.

create or replace function public.snow_storm_route_targets(p_storm_event_id uuid)
returns table (job_id uuid, crew_id uuid, ord integer, route_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  with sj as (
    select distinct on (v.job_id)
           v.job_id,
           case when v.crew_unassigned then null else coalesce(v.crew_id, j.crew_id) end as crew_id,
           coalesce(v.order_num, 2147483647) as ord
      from crm_job_visits v
      join crm_jobs j on j.id = v.job_id
     where v.storm_event_id = p_storm_event_id and v.deleted_at is null
     order by v.job_id, coalesce(v.order_num, 2147483647)
  )
  select sj.job_id, sj.crew_id, sj.ord,
         coalesce(
           (select st.route_id
              from crm_snow_route_stops st
              join crm_snow_routes r on r.id = st.route_id and r.deleted_at is null and r.is_active
             where st.job_id = sj.job_id),
           (select r.id
              from crm_snow_routes r
             where r.default_crew_id = sj.crew_id and r.deleted_at is null and r.is_active
             order by r.created_at
             limit 1)
         ) as route_id
    from sj;
$$;

revoke all on function public.snow_storm_route_targets(uuid) from public, anon;
grant execute on function public.snow_storm_route_targets(uuid) to authenticated;

-- ── Save a storm's order back onto the Master Routes ────────────────────────
-- A job already on a route is written back to THAT route: it keeps its slot,
-- the storm's jobs on the route take over their slots in storm order (grouped
-- by crew, then the crew's order), and each stop remembers the crew it ran
-- under (null when that is the route's default crew). Route stops that were
-- not on this storm keep their slots and crews.
--
-- A job on no route goes to its crew's default-crew route (created, named
-- after the crew, if there is none) -- unless the org uses shared routes
-- (any active route with no default crew): then it is left alone, because
-- inventing a crew-named route beside "All Plow Jobs" is never what that org
-- wants. Add it to a route in the Master Route builder.
--
-- A job moved between crews on the storm moves its stop's crew with it.
-- Returns how many storm jobs were written back.

create or replace function public.save_storm_order_to_snow_routes(p_storm_event_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_crew      record;
  v_route     record;
  v_has_shared boolean;
  v_new_route uuid;
  v_existing  uuid[];
  v_storm     uuid[];
  v_crews     uuid[];
  v_in_route  uuid[];
  v_new       uuid[];
  v_i         integer;
  v_k         integer;
  v_pos       integer;
  v_saved     integer := 0;
  v_job       uuid;
  v_stop_crew uuid;
begin
  if not exists (select 1 from crm_storm_events where id = p_storm_event_id and deleted_at is null) then
    raise exception 'Storm event not found';
  end if;

  select exists (
    select 1 from crm_snow_routes where deleted_at is null and is_active and default_crew_id is null
  ) into v_has_shared;

  -- Per-crew routes: make sure a crew with unrouted jobs has a route to land on.
  if not v_has_shared then
    for v_crew in
      select distinct t.crew_id, c.name as crew_name, c.org_id as crew_org_id
        from snow_storm_route_targets(p_storm_event_id) t
        join crm_crews c on c.id = t.crew_id
       where t.route_id is null
    loop
      insert into crm_snow_routes (org_id, name, default_crew_id)
      values (v_crew.crew_org_id, v_crew.crew_name, v_crew.crew_id)
      returning id into v_new_route;
    end loop;
  end if;

  for v_route in
    select r.id, r.org_id, r.default_crew_id
      from crm_snow_routes r
     where r.deleted_at is null and r.is_active
       and r.id in (select route_id from snow_storm_route_targets(p_storm_event_id) where route_id is not null)
     order by r.created_at, r.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_route.id::text, 0));

    -- Storm jobs for this route, grouped by crew then the storm's order.
    select coalesce(array_agg(t.job_id order by c.name nulls last, t.crew_id, t.ord, t.job_id), '{}'),
           coalesce(array_agg(t.crew_id order by c.name nulls last, t.crew_id, t.ord, t.job_id), '{}')
      into v_storm, v_crews
      from (
        -- Re-read after the per-crew insert above: unrouted jobs now resolve to their new route.
        select * from snow_storm_route_targets(p_storm_event_id)
      ) t
      left join crm_crews c on c.id = t.crew_id
     where t.route_id = v_route.id;

    if coalesce(array_length(v_storm, 1), 0) = 0 then continue; end if;

    select coalesce(array_agg(job_id order by sort_order, created_at), '{}')
      into v_existing
      from crm_snow_route_stops where route_id = v_route.id;

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

    for v_i in 1 .. array_length(v_new, 1) loop
      v_pos := array_position(v_storm, v_new[v_i]);
      if v_pos is null then
        -- Not on this storm: keep the crew it already has.
        update crm_snow_route_stops set sort_order = v_i - 1
         where route_id = v_route.id and job_id = v_new[v_i];
        continue;
      end if;
      -- The crew the stop ran under; the route's own default crew is stored as null.
      -- An unassigned storm stop leaves the saved crew as it was.
      v_stop_crew := case when v_crews[v_pos] is not distinct from v_route.default_crew_id then null else v_crews[v_pos] end;
      insert into crm_snow_route_stops (org_id, route_id, job_id, sort_order, crew_id)
      values (v_route.org_id, v_route.id, v_new[v_i], v_i - 1, v_stop_crew)
      on conflict (job_id) do update
        set route_id = excluded.route_id,
            sort_order = excluded.sort_order,
            crew_id = case when v_crews[v_pos] is null then crm_snow_route_stops.crew_id else excluded.crew_id end;
    end loop;

    v_saved := v_saved + array_length(v_storm, 1);
  end loop;

  return v_saved;
end;
$$;

revoke all on function public.save_storm_order_to_snow_routes(uuid) from public, anon;
grant execute on function public.save_storm_order_to_snow_routes(uuid) to authenticated;

-- ── "Permanent" crew assignment ─────────────────────────────────────────────
-- Same behaviour as before for a crew's own routes. p_route_id may now also
-- name a shared route (no default crew): the jobs go on it and each stop
-- remembers the crew. Unassigning (p_crew_id null) keeps a job's slot on a
-- shared route (only its crew is cleared) and takes it off a per-crew route
-- as before. Returns how many jobs were placed (or removed/cleared).

create or replace function public.assign_jobs_to_snow_route_crew(p_job_ids uuid[], p_crew_id uuid, p_route_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_route_id  uuid;
  v_default   uuid;
  v_org_id    uuid;
  v_crew_name text;
  v_next      integer;
  v_job       uuid;
  v_stop_crew uuid;
  v_count     integer := 0;
  v_cleared   integer := 0;
begin
  if p_job_ids is null or coalesce(array_length(p_job_ids, 1), 0) = 0 then
    return 0;
  end if;

  if p_crew_id is null then
    -- Shared routes keep the slot; only the stop's crew goes.
    update crm_snow_route_stops s
       set crew_id = null
      from crm_snow_routes r
     where r.id = s.route_id and r.default_crew_id is null
       and s.job_id = any (p_job_ids);
    get diagnostics v_cleared = row_count;

    delete from crm_snow_route_stops s
     using crm_snow_routes r
     where r.id = s.route_id and r.default_crew_id is not null
       and s.job_id = any (p_job_ids);
    get diagnostics v_count = row_count;
    return v_count + v_cleared;
  end if;

  select org_id, name into v_org_id, v_crew_name
    from crm_crews where id = p_crew_id and deleted_at is null;
  if v_org_id is null then
    raise exception 'Crew not found';
  end if;

  if p_route_id is not null then
    select id, default_crew_id into v_route_id, v_default
      from crm_snow_routes
     where id = p_route_id
       and (default_crew_id = p_crew_id or default_crew_id is null)
       and deleted_at is null and is_active;
    if v_route_id is null then
      raise exception 'That Master Route does not belong to the crew';
    end if;
  else
    select id, default_crew_id into v_route_id, v_default
      from crm_snow_routes
     where default_crew_id = p_crew_id and deleted_at is null and is_active
     order by created_at
     limit 1;
  end if;

  if v_route_id is null then
    insert into crm_snow_routes (org_id, name, default_crew_id)
    values (v_org_id, v_crew_name, p_crew_id)
    returning id, default_crew_id into v_route_id, v_default;
  end if;

  -- The route's own default crew is stored as null; a shared route stores the crew.
  v_stop_crew := case when v_default is not distinct from p_crew_id then null else p_crew_id end;

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
    -- Already where it should be: leave its slot alone (the crew is still updated).
    -- With a named route that is that route; otherwise any of the crew's routes.
    if exists (
      select 1
        from crm_snow_route_stops s
        join crm_snow_routes r on r.id = s.route_id
       where s.job_id = v_job
         and case when p_route_id is not null
                  then s.route_id = v_route_id
                  else r.default_crew_id = p_crew_id and r.deleted_at is null and r.is_active end
    ) then
      update crm_snow_route_stops s
         set crew_id = case when exists (
                 select 1 from crm_snow_routes r where r.id = s.route_id and r.default_crew_id is not distinct from p_crew_id
               ) then null else p_crew_id end
       where s.job_id = v_job;
      v_count := v_count + 1;
      continue;
    end if;
    insert into crm_snow_route_stops (org_id, route_id, job_id, sort_order, crew_id)
    values (v_org_id, v_route_id, v_job, v_next, v_stop_crew)
    on conflict (job_id) do update
      set route_id = excluded.route_id, sort_order = excluded.sort_order, crew_id = excluded.crew_id;
    v_next := v_next + 1;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.assign_jobs_to_snow_route_crew(uuid[], uuid, uuid) from public, anon;
grant execute on function public.assign_jobs_to_snow_route_crew(uuid[], uuid, uuid) to authenticated;
