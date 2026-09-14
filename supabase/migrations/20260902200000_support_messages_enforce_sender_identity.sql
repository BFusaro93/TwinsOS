-- Bug: support_messages.sender_id/sender_name were client-supplied and never
-- validated against the caller's real identity. The INSERT RLS policy
-- (20260901020000_support_chat.sql) only checked sender_type/org_id, so any
-- org member (or staff member) could post a message that displays as sent
-- by a different named person in their own org — an attribution spoof, not
-- a cross-org data leak (RLS still correctly scopes org_id/is_staff()).
--
-- Fix: a BEFORE INSERT trigger overwrites sender_id/sender_name with the
-- caller's own authenticated identity every time, regardless of what the
-- client submitted — the same "don't trust client-supplied identity fields,
-- derive from auth.uid()" principle already applied to org_id via
-- `default my_org_id()` on every other table in this codebase.

CREATE OR REPLACE FUNCTION public.enforce_support_message_sender_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT name INTO v_name FROM public.profiles WHERE id = auth.uid();

  NEW.sender_id := auth.uid();
  NEW.sender_name := COALESCE(v_name, NEW.sender_name, 'Unknown');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_support_message_sender_identity ON public.support_messages;
CREATE TRIGGER trg_enforce_support_message_sender_identity
  BEFORE INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_support_message_sender_identity();
