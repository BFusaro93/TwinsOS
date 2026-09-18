-- Crew notes-to-office appended to crm_job_visits.job_comments with a
-- read-modify-write in the route: read the array, push, write the whole array
-- back. Two failures, both reachable in a normal day:
--
--   * A crew note sent in the same moment a dispatcher adds a board comment —
--     both read the same array, both write their own version, and one comment
--     is silently lost. The route's own comment said it was trying to prevent
--     exactly this.
--   * The offline queue retries on any non-ApiError throw, so a POST whose
--     response was lost in a dead zone posts the note twice.
--
-- Doing the append inside the database under FOR UPDATE fixes the first, and
-- keying on the queue item's id fixes the second: a retry carries the same
-- p_comment_id, finds it already present, and returns the array unchanged.
--
-- SECURITY DEFINER because it must take a row lock and rewrite job_comments
-- regardless of the crew write lockdown on crm_job_visits (20260910160000),
-- which is why the org check below is not optional. Callers still prove visit
-- ownership in the route via assertCallerOwnsVisit before reaching this.
create or replace function public.crm_append_visit_job_comment(
  p_visit_id     uuid,
  p_comment_id   text,
  p_author_name  text,
  p_author_id    uuid,
  p_text         text,
  p_created_at   timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id   uuid;
  v_existing jsonb;
  v_next     jsonb;
begin
  if p_comment_id is null or btrim(p_comment_id) = '' then
    raise exception 'crm_append_visit_job_comment: p_comment_id is required';
  end if;

  select org_id, job_comments
    into v_org_id, v_existing
    from public.crm_job_visits
   where id = p_visit_id and deleted_at is null
   for update;

  if not found then
    raise exception 'Visit not found';
  end if;

  -- NULL my_org_id() (service role) deliberately passes, consistent with the
  -- other crew-facing RPCs in this schema.
  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  -- job_comments has carried a bare string in older rows, and NULL in most.
  -- Normalise before appending so one legacy row can't turn a crew note into a
  -- 500 halfway through a route.
  v_existing := case jsonb_typeof(v_existing)
    when 'array'  then v_existing
    when 'string' then jsonb_build_array(jsonb_build_object(
                         'id',         'crew-note',
                         'authorName', 'Crew',
                         'authorId',   '',
                         'text',       v_existing #>> '{}',
                         'createdAt',  p_created_at
                       ))
    else '[]'::jsonb
  end;

  -- Idempotent: the queue item's id is the comment id, so a replay is a no-op
  -- rather than a duplicate note on the dispatch board.
  if exists (
    select 1 from jsonb_array_elements(v_existing) e
     where e ->> 'id' = p_comment_id
  ) then
    return v_existing;
  end if;

  v_next := v_existing || jsonb_build_array(jsonb_build_object(
    'id',         p_comment_id,
    'authorName', p_author_name,
    'authorId',   coalesce(p_author_id::text, ''),
    'text',       p_text,
    'createdAt',  p_created_at
  ));

  update public.crm_job_visits
     set job_comments = v_next,
         updated_at   = p_created_at
   where id = p_visit_id;

  return v_next;
end;
$$;

revoke execute on function public.crm_append_visit_job_comment(uuid, text, text, uuid, text, timestamptz) from public, anon;
grant execute on function public.crm_append_visit_job_comment(uuid, text, text, uuid, text, timestamptz) to authenticated, service_role;
