-- Atomic view counter for public proposal links (was read+1 from the route).
CREATE OR REPLACE FUNCTION public.record_proposal_view(p_token_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.estimate_share_tokens
  SET first_viewed_at = COALESCE(first_viewed_at, now()),
      last_viewed_at = now(),
      view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_token_id;
$$;

REVOKE ALL ON FUNCTION public.record_proposal_view(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_proposal_view(uuid) TO service_role;

-- Twilio retries webhooks; one inbound MessageSid may be filed at most once per
-- client. (Several clients sharing a phone legitimately get one row each.)
CREATE UNIQUE INDEX IF NOT EXISTS client_activity_inbound_sms_sid_uniq
  ON public.client_activity (client_id, ref_id)
  WHERE ref_table = 'twilio_messages' AND direction = 'inbound';
