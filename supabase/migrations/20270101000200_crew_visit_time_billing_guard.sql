-- Crew logins can no longer write a visit's time / billing columns directly.
--
-- "crew updates own crew visits" lets a crew login UPDATE any column of its own
-- crew's visits through PostgREST, and only a_crm_job_visits_crew_price_guard
-- (rate_cents, qty) was refused. Snow bills from those other columns: per-inch
-- and per-push jobs from snow_depth_inches, hourly jobs from the clock stamps
-- less breaks (src/lib/snow-billing.ts), and Job Costing / the hours rollup from
-- actual_hours and men_count. A crew could therefore raise its own invoice
-- (30" of snow, a 12-hour clock span) or move a visit onto another storm.
--
-- The guard now also refuses a crew session's direct write to:
--   snow_depth_inches, clocked_in_at, clocked_out_at, break_minutes, paused_at,
--   start_time, end_time, actual_hours, men_count, push_number, storm_event_id
-- Every crew flow that legitimately writes them (Start Job, Stop Job, pause /
-- resume, the per-visit clock in/out, the auto-stop of a forgotten stop, punch
-- edits that re-derive hours) now writes with the service role AFTER the
-- route's own ownership checks (src/lib/crew/visit-writer.ts). The crew app never
-- records depth, push or storm. Office users are unchanged. pg_trigger_depth()
-- = 1 keeps trigger-made changes (rollups) out of it.
--
-- Audit attribution: a service-role write has no auth.uid(), so fn_audit_log
-- named it "system". The crew routes send the acting user in the
-- x-acting-user-id request header; fn_audit_log now reads it (only on a
-- service-role request, which only the server can make) after auth.uid() and
-- before its other fallbacks, so the visit's history still names who tapped.
--
-- Apply to PROD only AFTER the code that writes through the service role is
-- deployed — before that, the crew app's Start / Stop Job would be refused.

create or replace function public.crm_job_visits_crew_price_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if pg_trigger_depth() = 1
     and coalesce((select public.my_role()), '') = 'crew' then
    if new.rate_cents is distinct from old.rate_cents or new.qty is distinct from old.qty then
      raise exception 'A crew login can''t change a visit''s price or quantity.'
        using errcode = '42501';
    end if;
    if new.snow_depth_inches is distinct from old.snow_depth_inches
       or new.clocked_in_at is distinct from old.clocked_in_at
       or new.clocked_out_at is distinct from old.clocked_out_at
       or new.break_minutes is distinct from old.break_minutes
       or new.paused_at is distinct from old.paused_at
       or new.start_time is distinct from old.start_time
       or new.end_time is distinct from old.end_time
       or new.actual_hours is distinct from old.actual_hours
       or new.men_count is distinct from old.men_count
       or new.push_number is distinct from old.push_number
       or new.storm_event_id is distinct from old.storm_event_id then
      raise exception 'A crew login can''t change a visit''s times, hours, crew size or snow details directly — use Start / Stop Job in the crew app.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.crm_job_visits_crew_price_guard() from public, anon, authenticated;

drop trigger if exists a_crm_job_visits_crew_price_guard on public.crm_job_visits;
create trigger a_crm_job_visits_crew_price_guard
  before update of rate_cents, qty, snow_depth_inches, clocked_in_at, clocked_out_at, break_minutes,
    paused_at, start_time, end_time, actual_hours, men_count, push_number, storm_event_id
  on public.crm_job_visits
  for each row execute function public.crm_job_visits_crew_price_guard();

-- Attribution for service-role writes made on a user's behalf, patched INTO the
-- live fn_audit_log so none of its other branches/guards are restated.
do $$
declare
  v_src text := pg_get_functiondef('public.fn_audit_log()'::regprocedure);
  v_needle constant text := E'  -- 2. created_by, but ONLY on INSERT.';
  v_patch constant text :=
       E'  -- 1b. A server route writing with the service role on a user''s behalf\n'
    || E'  --     (crew Start / Stop Job) names that user in x-acting-user-id. Only\n'
    || E'  --     trusted on a service-role request, which only the server can make.\n'
    || E'  if v_user_name is null\n'
    || E'     and coalesce(nullif(current_setting(''request.jwt.claims'', true), '''')::jsonb ->> ''role'', '''') = ''service_role'' then\n'
    || E'    begin\n'
    || E'      select id, coalesce(name, email, id::text)\n'
    || E'      into v_user_id, v_user_name\n'
    || E'      from profiles\n'
    || E'      where id = nullif(nullif(current_setting(''request.headers'', true), '''')::jsonb ->> ''x-acting-user-id'', '''')::uuid;\n'
    || E'    exception when others then\n'
    || E'      v_user_id   := null;\n'
    || E'      v_user_name := null;\n'
    || E'    end;\n'
    || E'  end if;\n\n';
begin
  if position('x-acting-user-id' in v_src) > 0 then
    return; -- already patched
  end if;
  if (length(v_src) - length(replace(v_src, v_needle, ''))) / length(v_needle) <> 1 then
    raise exception 'fn_audit_log attribution patch did not match exactly once';
  end if;
  v_src := replace(v_src, v_needle, v_patch || v_needle);
  execute v_src;
end $$;

notify pgrst, 'reload schema';
