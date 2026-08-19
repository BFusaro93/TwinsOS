-- ── zapier_webhook_subscriptions ────────────────────────────────────────────
-- REST Hook subscriptions created by Zapier ("when this happens, POST to my
-- catch hook URL"). One row per Zap trigger the org has turned on. Delivery
-- is fired from src/lib/integrations/zapier.ts (notifyZapierSubscribers),
-- called alongside fireSimpleTrigger for the trigger types Zapier exposes.
-- Auth for the subscribe/unsubscribe/deliver paths is the org's Zapier API
-- key stored on public.integrations (provider = 'zapier') — no schema change
-- needed there, per that table's design.

CREATE TABLE public.zapier_webhook_subscriptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger_type text        NOT NULL,
  target_url   text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX zapier_webhook_subscriptions_lookup_idx
  ON public.zapier_webhook_subscriptions (org_id, trigger_type)
  WHERE deleted_at IS NULL;

ALTER TABLE public.zapier_webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- Read/write via the authenticated session (Settings UI subscription list).
-- The Zapier API routes use the service-role client and enforce org scoping
-- in application code (resolved from the API key), same trust model as the
-- other token-authenticated public routes.
CREATE POLICY "org_members_zapier_webhook_subscriptions" ON public.zapier_webhook_subscriptions
  FOR ALL
  USING  (org_id = public.my_org_id())
  WITH CHECK (org_id = public.my_org_id());
