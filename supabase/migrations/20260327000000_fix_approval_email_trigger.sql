-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: fix_approval_email_trigger
--
-- The fn_notify_approval_email() trigger calls net.http_post() which fails at
-- parse time if the pg_net extension is not installed, even though the function
-- has a guard that checks for config settings. This causes ALL status updates
-- on requisitions and purchase_orders to fail with:
--   "function net.http_post(...) does not exist"
--
-- Fix: use dynamic SQL (EXECUTE) to call net.http_post() so PostgreSQL only
-- resolves the function at runtime, after the config guard can short-circuit.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_notify_approval_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url  text;
  v_auth_key  text;
  v_payload   jsonb;
  v_has_pgnet boolean;
BEGIN
  -- Only fire on actual status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Only the statuses that drive approval notifications
  IF NEW.status NOT IN ('pending_approval', 'pending', 'approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- Read per-environment config — silently skip if not configured
  v_base_url := current_setting('app.edge_function_base_url', true);
  v_auth_key := current_setting('app.service_role_key',        true);

  IF v_base_url IS NULL OR v_base_url = ''
  OR v_auth_key IS NULL OR v_auth_key = ''
  THEN
    RETURN NEW;
  END IF;

  -- Check if pg_net extension is available — silently skip if not installed
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
    INTO v_has_pgnet;

  IF NOT v_has_pgnet THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'table',      TG_TABLE_NAME,
    'record',     row_to_json(NEW)::jsonb,
    'old_record', row_to_json(OLD)::jsonb
  );

  -- Use dynamic SQL so PostgreSQL doesn't fail at parse time when pg_net
  -- is not installed. The extension check above guarantees this only runs
  -- when net.http_post() actually exists.
  EXECUTE format(
    'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L)',
    v_base_url || '/send-approval-email',
    jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_auth_key
    )::text,
    v_payload::text
  );

  RETURN NEW;
END;
$$;
