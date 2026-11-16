-- Bug sweep round 14 (F5): crew "Add Push" race.
--
-- The add-push route checked "is a push already open?" without a lock and, on a
-- unique (job, storm, push_number) conflict, retried with the next number — so two
-- crews' tablets tapping Add Push at the same moment created pushes N+1 AND N+2,
-- each dispatched and each billable on Per Push jobs.
--
-- crm_add_snow_push does the check and the insert in ONE transaction under a
-- per-(job, storm) advisory lock: the second tap waits, then sees the first tap's
-- open push and is refused with SQLSTATE PT409 ("Another push is already open").
-- A unique violation (should no longer happen) is reported the same way, never
-- retried with a higher number.
--
-- Called only by the route (service role) after it has checked the caller owns the
-- source visit and the org is writable — not granted to authenticated/anon.

create or replace function public.crm_add_snow_push(
  p_source_visit_id uuid,
  p_scheduled_date date,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_src      crm_job_visits%rowtype;
  v_job_type text;
  v_last     record;
  v_last_num integer;
  v_order    integer;
  v_new_id   uuid := gen_random_uuid();
  v_push     integer;
begin
  select * into v_src from crm_job_visits
   where id = p_source_visit_id and deleted_at is null;
  if not found then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;

  select job_type into v_job_type from crm_jobs
   where id = v_src.job_id and org_id = v_src.org_id and deleted_at is null;
  if v_src.storm_event_id is null or v_job_type is distinct from 'snow' then
    raise exception 'Only a snow storm visit can get another push.' using errcode = '22023';
  end if;
  if v_src.status <> 'completed' then
    raise exception 'Finish this stop before adding another push.' using errcode = 'PT409';
  end if;

  -- One Add Push at a time per job + storm. Every tap after the first waits here and
  -- then sees the first one's push (READ COMMITTED: the next statement re-reads).
  perform pg_advisory_xact_lock(hashtextextended('crm_add_snow_push:' || v_src.job_id::text || ':' || v_src.storm_event_id::text, 0));

  select push_number, status into v_last
    from crm_job_visits
   where job_id = v_src.job_id
     and storm_event_id = v_src.storm_event_id
     and deleted_at is null
   order by push_number desc nulls last
   limit 1;
  v_last_num := coalesce(v_last.push_number, v_src.push_number, 1);
  if v_last.status in ('scheduled', 'dispatched', 'in_progress') then
    raise exception 'Another push is already open for this stop — it''s on your list.' using errcode = 'PT409';
  end if;

  select order_num into v_order
    from crm_job_visits
   where storm_event_id = v_src.storm_event_id
     and deleted_at is null
     and order_num is not null
   order by order_num desc
   limit 1;

  v_push := v_last_num + 1;
  begin
    insert into crm_job_visits (
      id, org_id, job_id, client_id, scheduled_date, men_count, crew_id, crew_unassigned,
      notes_to_crew, storm_event_id, order_num, status, push_number, created_by
    ) values (
      v_new_id, v_src.org_id, v_src.job_id, v_src.client_id,
      p_scheduled_date,
      greatest(1, coalesce(v_src.men_count, 1)),
      v_src.crew_id, coalesce(v_src.crew_unassigned, false),
      v_src.notes_to_crew, v_src.storm_event_id,
      coalesce(v_order + 1, 0),
      -- Dispatched: a crew only sees dispatched work, and they are on site now.
      'dispatched',
      v_push,
      p_created_by
    );
  exception when unique_violation then
    raise exception 'Another push is already open for this stop — it''s on your list.' using errcode = 'PT409';
  end;

  return jsonb_build_object('id', v_new_id, 'push_number', v_push);
end;
$function$;

revoke all on function public.crm_add_snow_push(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.crm_add_snow_push(uuid, date, uuid) to service_role;
