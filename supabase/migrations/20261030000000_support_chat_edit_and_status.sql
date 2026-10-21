-- Support chat: edit your own messages + per-conversation status.
--
-- 1. support_messages.edited_at, and an UPDATE policy so a sender can fix THEIR
--    OWN message. A BEFORE UPDATE trigger limits the change to `body` (plus
--    stamping edited_at) so identity, org, side and time can never be rewritten.
-- 2. support_conversations: one status row per org's thread
--    (open / in_progress / resolved). Only staff change it by hand; triggers on
--    support_messages keep it moving: a customer message (re)opens a thread,
--    a staff reply marks it in progress.

ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE POLICY "senders edit own support messages" ON support_messages
  FOR UPDATE
  USING (
    sender_id = auth.uid()
    AND ((sender_type = 'org' AND org_id = my_org_id())
      OR (sender_type = 'staff' AND is_staff(auth.uid())))
  )
  WITH CHECK (sender_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_support_message_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.sender_type IS DISTINCT FROM OLD.sender_type
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.sender_name IS DISTINCT FROM OLD.sender_name
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only the message text can be edited';
  END IF;
  IF btrim(NEW.body) = '' THEN
    RAISE EXCEPTION 'A message cannot be empty';
  END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.edited_at := now();
  ELSE
    NEW.edited_at := OLD.edited_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_support_message_update ON public.support_messages;
CREATE TRIGGER trg_guard_support_message_update
  BEFORE UPDATE ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_support_message_update();

CREATE TABLE IF NOT EXISTS support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES organizations(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  status_changed_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org or staff read support conversations" ON support_conversations
  FOR SELECT USING (org_id = my_org_id() OR is_staff(auth.uid()));

CREATE POLICY "staff change support conversations" ON support_conversations
  FOR UPDATE USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "staff create support conversations" ON support_conversations
  FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE TRIGGER set_support_conversations_updated_at
  BEFORE UPDATE ON support_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Status follows the conversation. SECURITY DEFINER because a customer's
-- message must be able to reopen its thread though customers can't write the table.
CREATE OR REPLACE FUNCTION public.support_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_type = 'org' THEN
    -- A new customer message opens a thread and reopens a resolved one; a
    -- thread staff already picked up stays in progress.
    INSERT INTO support_conversations (org_id, status)
      VALUES (NEW.org_id, 'open')
      ON CONFLICT (org_id) DO UPDATE
        SET status = 'open', status_changed_at = now(), status_changed_by = NULL
        WHERE support_conversations.status = 'resolved';
  ELSE
    INSERT INTO support_conversations (org_id, status, status_changed_by)
      VALUES (NEW.org_id, 'in_progress', NEW.sender_id)
      ON CONFLICT (org_id) DO UPDATE
        SET status = 'in_progress', status_changed_at = now(), status_changed_by = NEW.sender_id
        WHERE support_conversations.status <> 'in_progress';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_conversation_on_message ON public.support_messages;
CREATE TRIGGER trg_support_conversation_on_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_conversation_on_message();

REVOKE EXECUTE ON FUNCTION public.support_conversation_on_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_support_message_update() FROM PUBLIC, anon, authenticated;

-- Existing threads: waiting on us if the customer spoke last, otherwise in progress.
INSERT INTO support_conversations (org_id, status)
SELECT DISTINCT ON (org_id) org_id,
       CASE WHEN sender_type = 'org' THEN 'open' ELSE 'in_progress' END
FROM support_messages
ORDER BY org_id, created_at DESC
ON CONFLICT (org_id) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
