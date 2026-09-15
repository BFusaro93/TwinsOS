-- Support chat: a subscribing org's conversation with Landscapt's own
-- support team (the "Growth plan: chat support" feature) — distinct from
-- crm_tickets/comments/the client portal, which are all for a landscaping
-- company's conversations with ITS OWN clients, not with Landscapt.
--
-- One thread per org (no separate conversations table — the staff inbox
-- just groups support_messages by org_id for its list). Mirrors the
-- is_staff()-gated pattern already established for impersonation: an org's
-- own members see/post to their own thread; any staff member sees/posts to
-- every org's thread. sender_type is enforced server-side so a regular org
-- member can't post a message impersonating staff (or vice versa).
CREATE TABLE support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT my_org_id() REFERENCES organizations(id),
  sender_type text NOT NULL CHECK (sender_type IN ('org', 'staff')),
  sender_id uuid REFERENCES profiles(id),
  sender_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org or staff read support messages" ON support_messages
  FOR SELECT
  USING (org_id = my_org_id() OR is_staff(auth.uid()));

-- Org members can only post as themselves into their own org's thread;
-- staff can post as staff into ANY org's thread (no impersonation session
-- required — chat is a lighter-weight capability than full org access).
CREATE POLICY "org or staff insert support messages" ON support_messages
  FOR INSERT
  WITH CHECK (
    (sender_type = 'org' AND org_id = my_org_id())
    OR (sender_type = 'staff' AND is_staff(auth.uid()))
  );
