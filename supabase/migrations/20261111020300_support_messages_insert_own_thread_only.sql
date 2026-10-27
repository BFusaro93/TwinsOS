-- support_messages INSERT: a customer message only had to satisfy
-- org_id = my_org_id(), so any org member could post into a COWORKER's private
-- support thread (thread_user_id is free text on insert) or forge the sender.
-- SELECT/UPDATE already scope a thread to its owner (thread_user_id =
-- auth.uid()); INSERT now matches: a non-staff ('org') message must go to the
-- caller's own thread and be attributed to the caller. Staff replies keep
-- posting into any customer's thread (is_staff branch unchanged).
--
-- org_id stays compared with my_org_id() (not the profile's home org) so staff
-- impersonation, which overrides my_org_id(), keeps working exactly as before.
-- The chat widget / useSendSupportMessage already send thread_user_id and
-- sender_id = the signed-in user for 'org' messages, so nothing in the app
-- changes. RESTRICTIVE policies on the table (none today) are untouched.
DROP POLICY IF EXISTS "org or staff insert support messages" ON public.support_messages;
CREATE POLICY "org or staff insert support messages" ON public.support_messages
  FOR INSERT TO public
  WITH CHECK (
    (
      sender_type = 'org'
      AND org_id = my_org_id()
      AND thread_user_id = auth.uid()
      AND sender_id = auth.uid()
    )
    OR (sender_type = 'staff' AND is_staff(auth.uid()))
  );
