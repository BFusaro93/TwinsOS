-- KPI Scorecard: seed the org's scorecard row on first visit regardless of
-- who visits. The default layout is the org's starting point, not a user
-- decision, so a view-only user (view_report_center without
-- manage_report_center) must not see an unsaved placeholder that a later
-- manager visit silently replaces.
--
-- SECURITY DEFINER so the insert clears the manage_report_center RLS policy
-- (20260905120000), but the org always comes from the caller's session via
-- my_org_id() — never from an argument — and the caller must still hold
-- view_report_center. p_config is the app's default layout (kept in TS,
-- src/lib/kpi/landscapt-kpi-catalog.ts, so there is one source of truth).

create or replace function public.crm_kpi_scorecard_ensure(p_config jsonb)
returns setof public.crm_kpi_scorecards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.my_org_id();
begin
  if v_org is null or auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not public.has_settings_permission('view_report_center') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  insert into public.crm_kpi_scorecards (org_id, name, config, created_by)
  values (v_org, 'KPI Scorecard', coalesce(p_config, '{}'::jsonb), auth.uid())
  on conflict (org_id) where deleted_at is null do nothing;

  return query
    select *
    from public.crm_kpi_scorecards
    where org_id = v_org and deleted_at is null
    order by created_at
    limit 1;
end;
$$;

revoke all on function public.crm_kpi_scorecard_ensure(jsonb) from public;
grant execute on function public.crm_kpi_scorecard_ensure(jsonb) to authenticated;
