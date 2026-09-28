-- More per-dashboard view keys (follow-up to 20260928213426).
--
-- /dashboards/custom/*, /dashboards/job-costing, /dashboards/estimate-builder
-- and /dashboards/calculators aren't in the Dashboards nav, so the #173 gate
-- never applied to them — anyone with the URL got in. Each now has its own
-- key under Roles → Home → Dashboard Access. Seeded the same way as #173:
-- every existing role starts with them on (no one loses access on deploy);
-- keys a role already has are left alone.
--
-- The client gate also now fails CLOSED for non-admins without an active
-- role (no linked employee, no role, or a soft-deleted role).
update public.crm_roles
set permissions = jsonb_build_object(
      'view_dashboard_custom',           true,
      'view_dashboard_job_costing',      true,
      'view_dashboard_estimate_builder', true,
      'view_dashboard_calculators',      true
    ) || coalesce(permissions, '{}'::jsonb)
where deleted_at is null;
