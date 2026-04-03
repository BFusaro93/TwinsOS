-- In-app notifications for automation actions (send_notification action type)
CREATE TABLE public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message    text        NOT NULL,
  read       boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read and update (mark as read) their own notifications
CREATE POLICY "users_own_notifications" ON public.notifications
  FOR ALL USING (user_id = auth.uid());

-- Service role (automation engine) can insert notifications for any user in the org
CREATE POLICY "service_insert_notifications" ON public.notifications
  FOR INSERT WITH CHECK (org_id = public.my_org_id());
