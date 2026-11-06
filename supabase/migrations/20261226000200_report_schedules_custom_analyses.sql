-- Scheduling SAVED CUSTOM ANALYSES (crm_custom_reports) like prebuilt reports.
-- ADDITIVE + IDEMPOTENT. Not yet applied anywhere.
--
-- 1. report_schedules.custom_report_id (nullable FK) — a schedule targets EITHER a
--    prebuilt report (report_key) OR a saved analysis (custom_report_id), never both.
--    report_key becomes nullable; existing rows all have it set so the check holds.
-- 2. report_schedules.date_filter_column / date_window — optional RELATIVE date window
--    for an analysis (saved analyses carry fixed dates; a recurring send would repeat
--    a stale range). The app turns the window into gte/lte filters on the ORG's calendar
--    at send time.
-- 3. Soft-deleting a saved analysis pauses its schedules.
-- 4. report_user_has_permission(user, key[, org]) — has_settings_permission for an
--    explicit user id, so the cron can re-check the schedule creator's role at send time.
-- 5. crm_run_report_for_org — the cron's ONLY way to run an analysis with the service role.
--
-- ORG SAFETY of (5): the cron has no user session, so RLS cannot scope the rpt_* views.
-- crm_run_report_for_org therefore (a) runs only on datasets whose view has an org_id
-- column (checked against information_schema; as of writing: rpt_audit_log,
-- rpt_contract_service_usage, rpt_job_visits, rpt_sales_rep_month) and rejects joins,
-- (b) ANDs `org_id = p_org_id` into the filters itself — callers cannot remove it,
-- (c) verifies p_user_id belongs to p_org_id, and sets that user's JWT claims for the
-- transaction so my_timezone() (bare-date filters) resolves to the ORG's zone; it then
-- asserts my_org_id() = p_org_id. Executable by service_role only.

alter table public.report_schedules
  alter column report_key drop not null,
  add column if not exists custom_report_id uuid references public.crm_custom_reports(id) on delete cascade,
  add column if not exists date_filter_column text,
  add column if not exists date_window text;

create index if not exists report_schedules_custom_report_idx
  on public.report_schedules (custom_report_id) where custom_report_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'report_schedules_target_check') then
    alter table public.report_schedules
      add constraint report_schedules_target_check
      check ((report_key is not null)::int + (custom_report_id is not null)::int = 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'report_schedules_date_window_check') then
    alter table public.report_schedules
      add constraint report_schedules_date_window_check
      check (
        (date_filter_column is null and date_window is null)
        or (
          custom_report_id is not null
          and date_filter_column ~ '^[a-z_][a-z0-9_]*$'
          and date_window in ('yesterday','last_7_days','last_30_days','month_to_date','this_month',
                              'last_month','year_to_date','this_year','last_year')
        )
      );
  end if;
end $$;

comment on column public.report_schedules.date_window is
  'Relative window applied to date_filter_column at send time, on the org calendar (src/lib/reports/schedule-date-window.ts).';

-- Pause schedules when their saved analysis is soft-deleted.
create or replace function public.report_schedules_pause_on_analysis_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.report_schedules
     set enabled = false,
         last_run_status = 'error',
         last_run_error = 'The saved analysis was deleted.',
         updated_at = now()
   where custom_report_id = new.id and deleted_at is null and enabled;
  return new;
end;
$$;
revoke all on function public.report_schedules_pause_on_analysis_delete() from public, anon, authenticated;

drop trigger if exists crm_custom_reports_pause_schedules on public.crm_custom_reports;
create trigger crm_custom_reports_pause_schedules
  after update of deleted_at on public.crm_custom_reports
  for each row
  when (new.deleted_at is not null and old.deleted_at is null)
  execute function public.report_schedules_pause_on_analysis_delete();

-- has_settings_permission() for an explicit user (mirrors 20261201000100: admin
-- profile, else an active, non-deleted crm_employee on an active role with the key).
-- p_org_id (optional): the user must belong to that org.
create or replace function public.report_user_has_permission(p_user_id uuid, p_key text, p_org_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_org uuid;
  v_permissions jsonb;
begin
  if p_user_id is null then return false; end if;
  select role, org_id into v_role, v_org from public.profiles where id = p_user_id;
  if not found then return false; end if;
  if p_org_id is not null and v_org is distinct from p_org_id then return false; end if;
  if v_role = 'admin' then return true; end if;

  select cr.permissions into v_permissions
  from public.crm_employees ce
  join public.crm_roles cr on cr.id = ce.crm_role_id
  where ce.user_id = p_user_id
    and ce.deleted_at is null
    and ce.is_active
    and cr.deleted_at is null
    and cr.is_active;
  if v_permissions is null then return false; end if;
  return coalesce((v_permissions ->> p_key)::boolean, false);
end;
$$;
revoke all on function public.report_user_has_permission(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.report_user_has_permission(uuid, text, uuid) to service_role;

create or replace function public.crm_run_report_for_org(
  p_org_id uuid,
  p_user_id uuid,
  p_dataset text,
  p_columns text[],
  p_filters jsonb default '[]'::jsonb,
  p_group_by text[] default null::text[],
  p_aggregates jsonb default '[]'::jsonb,
  p_sort_column text default null::text,
  p_sort_dir text default 'asc'::text,
  p_limit integer default 1000,
  p_joins jsonb default '[]'::jsonb,
  p_sorts jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_claims text := current_setting('request.jwt.claims', true);
  v_result jsonb;
begin
  if p_org_id is null or p_user_id is null then
    raise exception 'org and user are required';
  end if;
  if jsonb_array_length(coalesce(p_joins, '[]'::jsonb)) > 0 then
    raise exception 'Scheduled analyses cannot use joins';
  end if;
  -- only views that carry org_id can be scoped without RLS
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_dataset and column_name = 'org_id'
  ) then
    raise exception 'Dataset % cannot be scheduled (no org_id column)', p_dataset;
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and org_id = p_org_id) then
    raise exception 'User does not belong to this org';
  end if;

  -- org clock for bare-date filters: act as that user for this transaction
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  if public.my_org_id() is distinct from p_org_id then
    raise exception 'Org context mismatch';
  end if;

  v_result := public.crm_run_report(
    p_dataset => p_dataset,
    p_columns => p_columns,
    p_filters => coalesce(p_filters, '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('column', 'org_id', 'op', 'eq', 'value', p_org_id::text)),
    p_group_by => p_group_by,
    p_aggregates => p_aggregates,
    p_sort_column => p_sort_column,
    p_sort_dir => p_sort_dir,
    p_limit => p_limit,
    p_joins => '[]'::jsonb,
    p_sorts => p_sorts
  );

  perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
  return v_result;
end;
$$;
revoke all on function public.crm_run_report_for_org(uuid, uuid, text, text[], jsonb, text[], jsonb, text, text, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.crm_run_report_for_org(uuid, uuid, text, text[], jsonb, text[], jsonb, text, text, integer, jsonb, jsonb) to service_role;
