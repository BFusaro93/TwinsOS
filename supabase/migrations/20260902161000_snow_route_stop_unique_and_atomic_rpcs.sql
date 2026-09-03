-- Bug: crm_snow_route_stops only enforced UNIQUE (route_id, job_id), which
-- stops a job being added twice to the *same* Master Route but does nothing
-- to stop the same job being added as a stop on two *different* routes
-- (e.g. added to "Route A", then also added to "Route B" before anyone
-- notices it's already assigned) — the job then gets dispatched twice for
-- the same storm. Master Routes in this schema are not storm-scoped
-- (crm_snow_route_stops carries no storm_event_id and no deleted_at column
-- — they're persistent stop-order templates, not per-storm-event rows), so
-- the real invariant to enforce is simpler than "unique per storm event":
-- a job may be an active stop on at most one route at a time, full stop.
create unique index if not exists crm_snow_route_stops_job_unique
  on public.crm_snow_route_stops (job_id);

-- Bug: useAddRouteStop (src/lib/hooks/use-snow-dispatch.ts) did a
-- client-side read-then-insert — SELECT MAX(sort_order) followed by a
-- separate INSERT. Two concurrent "Add Stop" calls for the same route can
-- both read the same current max and insert with the same sort_order,
-- producing duplicate/ambiguous stop ordering. Move the whole
-- read-then-insert into one atomic RPC, serialized per route with a
-- transaction-scoped advisory lock so the MAX(sort_order) read can never
-- race with another add to the same route.
create or replace function public.add_snow_route_stop(p_route_id uuid, p_job_id uuid)
returns public.crm_snow_route_stops
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_next_order int;
  v_row public.crm_snow_route_stops;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_route_id::text, 0));

  select coalesce(max(sort_order), -1) + 1 into v_next_order
  from public.crm_snow_route_stops
  where route_id = p_route_id;

  insert into public.crm_snow_route_stops (route_id, job_id, sort_order)
  values (p_route_id, p_job_id, v_next_order)
  returning * into v_row;

  return v_row;
end;
$$;

-- Bug: useReorderRouteStops issued N independent UPDATE statements via
-- Promise.all — not transactional, so a mid-flight failure (or another
-- viewer reading the stop list) could observe or persist a half-applied
-- reorder (duplicate/gapped sort_order values). A single UPDATE ... FROM a
-- jsonb payload is one statement, so all rows are updated atomically.
create or replace function public.reorder_snow_route_stops(p_route_id uuid, p_stops jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.crm_snow_route_stops s
  set sort_order = x.sort_order
  from jsonb_to_recordset(p_stops) as x(id uuid, sort_order int)
  where s.id = x.id
    and s.route_id = p_route_id;
end;
$$;

grant execute on function public.add_snow_route_stop(uuid, uuid) to authenticated;
grant execute on function public.reorder_snow_route_stops(uuid, jsonb) to authenticated;
