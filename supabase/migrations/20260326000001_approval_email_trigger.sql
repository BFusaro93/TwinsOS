-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: approval_email_trigger
-- Fires an async HTTP request (via pg_net) to the send-approval-email Edge
-- Function whenever a requisition or purchase order moves into an approval-
-- relevant status: pending_approval / pending / approved / rejected.
--
-- ── Configuration (run once per environment, outside this migration) ──────────
-- These two Postgres settings must be set before the triggers will send email.
-- Never commit real values to source control — set them via your deployment
-- process or Supabase CLI secrets:
--
--   ALTER DATABASE postgres
--     SET app.edge_function_base_url = 'https://<PROJECT_REF>.supabase.co/functions/v1';
--
--   ALTER DATABASE postgres
--     SET app.service_role_key = '<SERVICE_ROLE_KEY>';
--
-- The trigger function reads these with current_setting(..., true) and silently
-- skips the HTTP call if either setting is absent (safe for local dev without
-- a configured Resend account).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Enable pg_net ──────────────────────────────────────────────────────────
-- pg_net ships with every Supabase project. If running locally via
-- `supabase start`, it must be enabled in supabase/config.toml under
-- [db.extensions] or installed manually.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
END$$;


-- ── 2. Trigger function ───────────────────────────────────────────────────────

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

  v_payload := jsonb_build_object(
    'table',      TG_TABLE_NAME,
    'record',     row_to_json(NEW)::jsonb,
    'old_record', row_to_json(OLD)::jsonb
  );

  -- Fire-and-forget: pg_net queues the HTTP call asynchronously so the DB
  -- transaction is not blocked on email delivery.
  PERFORM net.http_post(
    url     := v_base_url || '/send-approval-email',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_auth_key
    ),
    body    := v_payload::text
  );

  RETURN NEW;
END;
$$;


-- ── 3. Attach to requisitions and purchase_orders ─────────────────────────────

CREATE TRIGGER trg_notify_email_requisitions
  AFTER UPDATE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_approval_email();

CREATE TRIGGER trg_notify_email_purchase_orders
  AFTER UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_approval_email();
