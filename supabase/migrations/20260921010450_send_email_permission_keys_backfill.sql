-- Three send-email routes were enforcing no permission at all:
--   /api/crm/invoices/email
--   /api/crm/clients/[clientId]/statement/email
--   /api/crm/chemical-applications/[visitId]/send-email
-- Unlike the client/estimate routes fixed in #130, these had no key to mirror
-- — nothing gated *sending* anywhere, UI included. This adds the three keys
-- and backfills them so the gate doesn't retroactively remove the ability.
--
-- Backfill is deliberately PERMISSIVE: each new key is granted to roles that
-- can already reach the surface today (the view key), not to the narrower
-- write key. That still closes the hole — the threat is a role with no
-- accounting/chemical access at all POSTing directly, and such a role fails
-- the view key too — while breaking no existing workflow. Admins can untick
-- per role afterwards to tighten; has_settings_permission() short-circuits on
-- profiles.role = 'admin', so admins are unaffected either way.
--
-- NOTE: additive (permissions || ...), NOT the wholesale
-- `permissions = '{...}'::jsonb` replace used by
-- 20260706124134_crm_roles_defaults_and_org_id_fix.sql — orgs have customised
-- their roles since, and a wholesale write would clobber that.
--
-- Both has_settings_permission() and the UI's can() resolve a MISSING key to
-- false, so a role that doesn't match a predicate below simply keeps the
-- ability switched off until an admin grants it in Settings > Roles.

-- Invoice emailing → anyone who can already see the invoice list.
update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb)
                  || jsonb_build_object('acct_send_invoices', true)
where deleted_at is null
  and coalesce((permissions ->> 'acct_view_invoice_list')::boolean, false);

-- Statement emailing → anyone who can already see a client's invoices.
update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb)
                  || jsonb_build_object('acct_send_statements', true)
where deleted_at is null
  and coalesce((permissions ->> 'acct_view_client_invoices')::boolean, false);

-- Chemical application notices → anyone who can already log an application.
-- There is no separate chemical "view" key; add/edit usage is the surface gate.
update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb)
                  || jsonb_build_object('chem_send_application_notice', true)
where deleted_at is null
  and coalesce((permissions ->> 'chem_add_edit_usage')::boolean, false);
