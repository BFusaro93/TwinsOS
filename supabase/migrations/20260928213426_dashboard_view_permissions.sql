-- Per-dashboard view permissions (Roles → Home → Dashboard Access).
-- New crm_roles keys gate which built-in dashboards a role sees. So that no
-- one loses access on deploy, every existing role starts with all of them on;
-- admins can then untick per role. Keys a role already has are left alone.
-- Twins-only legacy dashboards (Financial, Labor Efficiency, Twins KPI
-- Scorecard, Twins CRM Report) are not part of this — they stay on the
-- internal-org check until they're retired.
update public.crm_roles
set permissions = jsonb_build_object(
      'view_dashboard_equipt',          true,
      'view_dashboard_myday',           true,
      'view_dashboard_reports',         true,
      'view_dashboard_kpis',            true,
      'view_dashboard_driver_safety',   true,
      'view_dashboard_company_report',  true,
      'view_dashboard_social_media',    true
    ) || coalesce(permissions, '{}'::jsonb)
where deleted_at is null;
