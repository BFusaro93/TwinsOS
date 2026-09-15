-- Sticky stop order: if MAINT1 is routed a certain way this Monday, next
-- Monday's board comes up in that same sequence.
--
-- Today the dispatch board's "Save Order" writes crm_job_visits.priority, which
-- is per-visit-row and therefore per-DAY. Next Monday's visits are different
-- rows, so the route reverts to an unordered crew grouping and has to be
-- re-dragged every week. This table remembers the sequence one level up — by
-- (crew, weekday, job) — so it survives into every future occurrence.
--
-- Keyed on weekday, not just crew, because a crew's Monday neighbourhood is a
-- different geographic run from its Wednesday one. A job that moves to another
-- day simply has no remembered position on the new day and sorts to the end,
-- which is the right prompt for someone to place it.

create table if not exists crm_crew_route_order (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) default my_org_id(),
  crew_id     uuid not null references crm_crews(id) on delete cascade,
  -- 0 = Sunday … 6 = Saturday, matching both extract(dow) and JS getDay().
  day_of_week smallint not null check (day_of_week between 0 and 6),
  job_id      uuid not null references crm_jobs(id) on delete cascade,
  position    integer not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null,
  -- One remembered position per job per crew per weekday. A job legitimately
  -- appears on several weekdays (twice-weekly mowing) and can be re-crewed, so
  -- the uniqueness is on the whole triple, not on job_id alone.
  constraint crm_crew_route_order_unique unique (crew_id, day_of_week, job_id)
);

create index if not exists crm_crew_route_order_lookup_idx
  on crm_crew_route_order(org_id, day_of_week, crew_id, position);

alter table crm_crew_route_order enable row level security;

drop policy if exists "org members manage crew route order" on crm_crew_route_order;
create policy "org members manage crew route order"
  on crm_crew_route_order for all
  using (org_id = my_org_id())
  with check (org_id = my_org_id());

-- Same employee-link gate every other CRM business table carries
-- (20260906210000_wide_crm_rls_tightening_restrictive_policies.sql).
drop policy if exists "require_crm_access" on crm_crew_route_order;
create policy "require_crm_access" on crm_crew_route_order
  as restrictive for all
  using (has_crm_access()) with check (has_crm_access());

-- ── save one day's order, and remember it ────────────────────────────────────
-- Replaces the board's previous N parallel per-visit UPDATEs, which could half
-- apply and leave a scrambled sequence with no indication anything failed.
-- Writing the per-day priorities and the remembered order in one transaction
-- also guarantees the two can never disagree.
--
-- p_visit_ids is the full ordered list of visit ids as shown on the board.
-- Position within the remembered order is the rank *within each crew*, because
-- each crew drives its own separate route — "#3" means that crew's third stop.
create or replace function crm_save_route_order(p_visit_ids uuid[])
returns integer
language plpgsql
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
      coalesce(v.crew_id, j.crew_id)                as crew_id,
      extract(dow from v.scheduled_date)::smallint  as day_of_week,
      v.job_id,
      o.pos,
      row_number() over (
        partition by coalesce(v.crew_id, j.crew_id), extract(dow from v.scheduled_date)
        order by o.pos
      )::integer as crew_pos
    from ordered o
    join crm_job_visits v on v.id = o.id
    join crm_jobs j on j.id = v.job_id
    where v.org_id = v_org
      and v.deleted_at is null
      and v.scheduled_date is not null
      and coalesce(v.crew_id, j.crew_id) is not null
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

grant execute on function crm_save_route_order(uuid[]) to authenticated;
