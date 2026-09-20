-- ─────────────────────────────────────────────────────────────────────────────
-- Clear the standing Supabase security advisor findings.
--
-- 1. financial_periods_bak_20260915 had RLS disabled entirely (the only
--    ERROR-level finding). It is a backup of the AvB monthly P&L figures, so
--    every authenticated user of every org could read another org's revenue,
--    EBITDA and cash flow. RLS is enabled with NO policy: a backup needs no
--    client access at all, and service-role restores bypass RLS anyway. That
--    is strictly safer than mirroring the live table's org-scoped read.
--
-- 2. 29 functions had a mutable search_path. Fixed with ALTER FUNCTION rather
--    than CREATE OR REPLACE so no function body is rewritten — this repo has
--    already lost an in-function permission check to a careless replace.
--
-- 3. SECURITY DEFINER trigger functions were EXECUTE-able by `authenticated`
--    (and three by `anon`), which exposes them at /rest/v1/rpc/<name>. A
--    trigger function invoked directly runs with no NEW/OLD and outside the
--    statement it is meant to guard; several here write to audit_log, sync
--    client balances or gate approvals. Revoking is safe: PostgreSQL checks
--    EXECUTE on a trigger function at CREATE TRIGGER time, not when the
--    trigger fires.
--
--    Two ordinary functions are revoked too — fn_recalc_project_contract_price
--    and next_entity_number — because nothing outside the database calls them;
--    their in-database callers are SECURITY DEFINER and so run as the owner.
--
--    Deliberately NOT revoked: the RLS helpers (my_org_id, my_role, my_crew_ids,
--    is_staff, has_crm_access, has_settings_permission, is_client_portal_user)
--    are evaluated inside policies and, for my_org_id, as a column DEFAULT, so
--    they must stay callable by the roles the policies run as. Likewise
--    get_portal_invite_by_token keeps `anon`: /api/portal/invites/[token] and
--    /api/portal/register use the cookie client, which is anon for the
--    logged-out person accepting an invite.
--
-- 4. The seven "RLS enabled, no policy" tables are left exactly as they are.
--    Every one is written only by service-role code, so deny-all is the
--    intended and correct state — adding a policy would open them up, not
--    secure them. They are commented instead, so the next person reading the
--    advisor does not "fix" them.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The one ERROR: an unprotected backup of the financial figures ─────────

-- The backup only exists where it was taken (prod), so this is guarded: on
-- test and on a fresh environment it is simply a no-op.
DO $$
BEGIN
  IF to_regclass('public.financial_periods_bak_20260915') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.financial_periods_bak_20260915 ENABLE ROW LEVEL SECURITY';
    EXECUTE $c$COMMENT ON TABLE public.financial_periods_bak_20260915 IS
      'Backup of financial_periods taken 2026-09-15. RLS enabled with no policy on purpose: no client should read a backup, and a service-role restore bypasses RLS. Safe to drop once the AvB migration it was taken for is settled.'$c$;
  END IF;
END $$;

-- ── 2. Pin search_path on the 29 flagged functions ───────────────────────────

DO $$
DECLARE
  r record;
  fn_names text[] := array[
    'append_cost_layer', 'assign_invoice_number', 'crm_adjust_price_cents',
    'crm_apply_price_adjustment', 'crm_invoice_block_locked_financial_update',
    'crm_invoice_block_void_with_payments',
    'crm_invoice_line_items_block_when_locked', 'crm_jobs_default_date_sold',
    'crm_price_adjustment_candidates', 'crm_revert_price_adjustment',
    'crm_save_route_order', 'decrement_cost_layers',
    'increment_api_key_rate_limit', 'prevent_lead_client_invoice',
    'set_client_defaults', 'set_job_product_planned_qty',
    'set_pm_schedule_parts_updated_at', 'set_updated_at',
    'settings_permission_for_list_name', 'stamp_notes_to_crew_updated_at',
    'sync_client_balance', 'tag_chemical_volume_unit',
    'trg_sync_client_balance_on_allocation_change',
    'trg_sync_client_balance_on_invoice_change',
    'trg_sync_client_balance_on_payment_change',
    'update_avb_employees_updated_at', 'update_crm_document_blocks_updated_at',
    'update_crm_document_templates_updated_at', 'update_updated_at_column'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(fn_names)
      -- only those that do not already pin it
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
        WHERE cfg LIKE 'search\_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO ''public''', r.sig);
  END LOOP;
END $$;

-- ── 3. Take SECURITY DEFINER trigger functions off the REST surface ──────────

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype = 'pg_catalog.trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Ordinary functions with no caller outside the database. Their in-database
-- callers are SECURITY DEFINER, so they execute as the owner and do not need
-- these grants.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN ('fn_recalc_project_contract_price', 'next_entity_number')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- ── 4. Record that deny-all is intentional on the service-role-only tables ───

DO $$
DECLARE
  r text[];
  notes text[] := array[
    'auth_rate_limit_counters',
    'damage_case_counters',
    'entity_number_counters',
    'oauth_authorization_codes',
    'oauth_clients',
    'stripe_webhook_events',
    'zapier_rate_limit_counters'
  ];
  bodies text[] := array[
    'Service-role only. RLS enabled with no policy on purpose — login throttling counters must not be readable or writable by a client.',
    'Service-role only. RLS enabled with no policy on purpose — sequence counter, reached solely through next_damage_case_number().',
    'Service-role only. RLS enabled with no policy on purpose — sequence counter, reached solely through the next_*_number() functions.',
    'Service-role only. RLS enabled with no policy on purpose — short-lived OAuth codes, handled entirely by /api/mcp/oauth/*.',
    'Service-role only. RLS enabled with no policy on purpose — read via adminClient() in /oauth/authorize and /api/mcp/oauth/*.',
    'Service-role only. RLS enabled with no policy on purpose — written by the Stripe webhook handlers for idempotency.',
    'Service-role only. RLS enabled with no policy on purpose — throttling counters for the Zapier integration.'
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(notes, 1) LOOP
    IF to_regclass('public.' || notes[i]) IS NOT NULL THEN
      EXECUTE format('COMMENT ON TABLE public.%I IS %L', notes[i], bodies[i]);
    END IF;
  END LOOP;
END $$;

-- ── 5. Restate the grants that must survive, including one test/prod drift ───
--
-- get_portal_invite_by_token is anon-executable on prod but was NOT on test,
-- so the invite-acceptance flow (/api/portal/invites/[token] and
-- /api/portal/register, both on the cookie client, which is anon for a
-- logged-out visitor) is broken on test today. Granting it here fixes that
-- drift and is a no-op on prod. It is safe to expose: the function looks an
-- invite up by exact token — the unguessable token IS the authorization —
-- and returns nothing beyond that one invite's own fields.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_portal_invite_by_token'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
  END LOOP;
END $$;

-- The RLS helpers must stay callable by the roles policies are evaluated as.
-- Restated rather than assumed: a revoke sweep like the one above is exactly
-- how these get lost.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('my_org_id', 'my_role', 'my_crew_ids', 'is_staff',
                        'has_crm_access', 'has_settings_permission',
                        'is_client_portal_user')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
  END LOOP;
END $$;
