-- Support chat: one private thread per PERSON instead of one shared thread per org.
--
-- Until now every member of an org read and posted to a single thread, so a
-- teammate saw the admin's whole conversation with support (found when a crew
-- phone showed the owner's transcript). Each thread now belongs to the customer
-- user who started it (thread_user_id); staff still see every thread.
--
-- Also adds staff_notified_at: staff are emailed when a customer message has
-- gone 5 minutes without a staff reply (cron), instead of immediately.

ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS thread_user_id uuid REFERENCES profiles(id);
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS staff_notified_at timestamptz;

-- Existing org-wide threads stay with the person who wrote in: the org's
-- earliest customer-side sender, else its earliest admin. (PROD has one customer
-- sender per org, so this is exact.)
WITH owner AS (
  SELECT o.org_id,
         COALESCE(
           (SELECT m.sender_id FROM support_messages m
             WHERE m.org_id = o.org_id AND m.sender_type = 'org' AND m.sender_id IS NOT NULL
             ORDER BY m.created_at LIMIT 1),
           (SELECT p.id FROM profiles p
             WHERE p.org_id = o.org_id AND p.role = 'admin'
             ORDER BY p.created_at LIMIT 1)
         ) AS user_id
    FROM (SELECT DISTINCT org_id FROM support_messages) o
)
UPDATE support_messages sm
   SET thread_user_id = owner.user_id
  FROM owner
 WHERE sm.org_id = owner.org_id AND sm.thread_user_id IS NULL;

-- Nothing already in the table should trigger a staff email.
UPDATE support_messages SET staff_notified_at = now() WHERE staff_notified_at IS NULL;

CREATE INDEX IF NOT EXISTS support_messages_thread_idx
  ON support_messages (org_id, thread_user_id, created_at);
CREATE INDEX IF NOT EXISTS support_messages_pending_notify_idx
  ON support_messages (created_at) WHERE staff_notified_at IS NULL AND sender_type = 'org';

-- Conversation status is per thread too.
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS thread_user_id uuid REFERENCES profiles(id);

UPDATE support_conversations c
   SET thread_user_id = (
         SELECT m.thread_user_id FROM support_messages m
          WHERE m.org_id = c.org_id AND m.thread_user_id IS NOT NULL
          ORDER BY m.created_at LIMIT 1)
 WHERE c.thread_user_id IS NULL;

ALTER TABLE support_conversations DROP CONSTRAINT IF EXISTS support_conversations_org_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS support_conversations_thread_key
  ON support_conversations (org_id, thread_user_id) NULLS NOT DISTINCT;

-- Message rules: a customer reads only their own thread; staff read all. A customer's
-- thread id is forced to their own id by the identity trigger below, and a staff
-- reply must name the thread it answers.
DROP POLICY IF EXISTS "org or staff read support messages" ON support_messages;
CREATE POLICY "own thread or staff read support messages" ON support_messages
  FOR SELECT
  USING ((org_id = my_org_id() AND thread_user_id = auth.uid()) OR is_staff(auth.uid()));

DROP POLICY IF EXISTS "org or staff read support conversations" ON support_conversations;
CREATE POLICY "own thread or staff read support conversations" ON support_conversations
  FOR SELECT
  USING ((org_id = my_org_id() AND thread_user_id = auth.uid()) OR is_staff(auth.uid()));

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
  -- The cron owns this stamp; a sender can't pre-silence the staff email.
  NEW.staff_notified_at := NULL;

  IF NEW.sender_type = 'org' THEN
    NEW.thread_user_id := auth.uid();
  ELSIF NEW.thread_user_id IS NULL THEN
    RAISE EXCEPTION 'A staff reply must say which customer thread it belongs to';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_support_message_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.thread_user_id IS DISTINCT FROM OLD.thread_user_id
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

-- Status follows the thread (SECURITY DEFINER: a customer's message must be able to
-- reopen its thread though customers can't write the table).
CREATE OR REPLACE FUNCTION public.support_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_type = 'org' THEN
    INSERT INTO support_conversations (org_id, thread_user_id, status)
      VALUES (NEW.org_id, NEW.thread_user_id, 'open')
      ON CONFLICT (org_id, thread_user_id) DO UPDATE
        SET status = 'open', status_changed_at = now(), status_changed_by = NULL
        WHERE support_conversations.status = 'resolved';
  ELSE
    INSERT INTO support_conversations (org_id, thread_user_id, status, status_changed_by)
      VALUES (NEW.org_id, NEW.thread_user_id, 'in_progress', NEW.sender_id)
      ON CONFLICT (org_id, thread_user_id) DO UPDATE
        SET status = 'in_progress', status_changed_at = now(), status_changed_by = NEW.sender_id
        WHERE support_conversations.status <> 'in_progress';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.support_conversation_on_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_support_message_update() FROM PUBLIC, anon, authenticated;
