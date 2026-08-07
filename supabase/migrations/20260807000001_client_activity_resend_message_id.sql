-- The "Delivered" stat/column in Email Activity was removed (20260806, no
-- delivery webhook existed) since delivered_at was never written by anything.
-- This is the correlation key needed to actually wire that up: Resend's
-- webhook events reference the message by its own id, which none of our
-- send call-sites were persisting anywhere — add the column so an incoming
-- webhook event can find the client_activity row it's reporting on.

ALTER TABLE public.client_activity ADD COLUMN IF NOT EXISTS resend_message_id text;
CREATE INDEX IF NOT EXISTS client_activity_resend_message_id_idx
  ON public.client_activity(resend_message_id) WHERE resend_message_id IS NOT NULL;
