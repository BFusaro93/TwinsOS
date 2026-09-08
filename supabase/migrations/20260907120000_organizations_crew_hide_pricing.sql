-- Not every org wants crew tablets to see client-facing pricing on the stop
-- detail screen (rate per service). Org-level switch, defaulting to showing
-- prices (today's behavior) so existing orgs see no change.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS crew_hide_pricing boolean NOT NULL DEFAULT false;
