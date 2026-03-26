-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: app_config table for email trigger settings
-- Replaces the GUC-based config (ALTER DATABASE SET app.*) which Supabase
-- cloud does not permit. The approval email trigger reads from this table.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Only service role can read/write this table
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no_direct_access" ON public.app_config AS RESTRICTIVE
  USING (false);

-- Update the email trigger to read from app_config instead of GUC settings
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

  -- Read config from app_config table
  SELECT value INTO v_base_url FROM public.app_config WHERE key = 'edge_function_base_url';
  SELECT value INTO v_auth_key FROM public.app_config WHERE key = 'service_role_key';

  -- Silently skip if not configured
  IF v_base_url IS NULL OR v_auth_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'table',      TG_TABLE_NAME,
    'record',     row_to_json(NEW)::jsonb,
    'old_record', row_to_json(OLD)::jsonb
  );

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
