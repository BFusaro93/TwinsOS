-- Portal customers could SELECT estimates / estimate_line_items directly via
-- PostgREST with their own JWT. The two "portal user reads own ..." policies
-- (20260825000000_client_portal_multi_org.sql) had no stage or deleted_at
-- filter, and every column is granted, so a customer could read drafts,
-- soft-deleted estimates, and internal columns: gross/net profit, overhead,
-- cost_cents, margin_bps, internal_note, etc.
--
-- Every portal read of estimates now goes through the service client with
-- explicit client_id + org_id scoping from getPortalContext() and a
-- client-safe column list:
--   src/app/portal/(shell)/page.tsx
--   src/app/portal/(shell)/estimates/page.tsx
--   src/app/api/portal/dashboard/route.ts
--   src/app/api/portal/estimates/[id]/{action,pdf}/route.ts (already service)
-- so the policies are no longer needed and are dropped outright.
--
-- Estimate child tables (estimate_line_item_subitems, estimate_versions,
-- estimate_photos, estimate_milestones, estimate_share_tokens, ...) carry the
-- RESTRICTIVE require_crm_access policy (20260906210000) and
-- estimate_direct_costs is has_crm_access()-gated inline (20260906150001);
-- neither has a portal-user SELECT path, so nothing to change there.
--
-- The legacy crm_estimates policy (20260703030521) is dropped too if that
-- table still exists anywhere. Idempotent.

drop policy if exists "portal user reads own estimates" on public.estimates;
drop policy if exists "portal user reads own estimate line items" on public.estimate_line_items;

do $$
begin
  if to_regclass('public.crm_estimates') is not null then
    execute 'drop policy if exists "portal user reads own estimates" on public.crm_estimates';
  end if;
end $$;
