-- protect_stripe_billing_columns() reset only the Stripe/plan/trial columns
-- for non-service-role writers. organizations' UPDATE policy lets any user
-- with the settings permission edit their org row, so they could also rewrite:
--   * twilio_account_sid / twilio_messaging_service_sid — which Twilio account
--     and sender the org's texts go out through (point it at another org's
--     number, or at the shared platform sender);
--   * is_demo — mutes every outbound email/SMS for the org (and keeps it out of
--     alert digests);
--   * billing_interval — the billing cadence shown on the Subscription tab.
-- All four are written only by service-role code (Twilio provisioning, staff
-- tooling, the billing webhook), so they join the protected list.
--
-- Starts from the live definition (TEST, 2026-11-08) and keeps every existing
-- column and the oauth_write_roles admin-only guard.

CREATE OR REPLACE FUNCTION public.protect_stripe_billing_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.plan                        := OLD.plan;
    NEW.stripe_customer_id          := OLD.stripe_customer_id;
    NEW.stripe_subscription_id      := OLD.stripe_subscription_id;
    NEW.stripe_price_id             := OLD.stripe_price_id;
    NEW.stripe_subscription_status  := OLD.stripe_subscription_status;
    NEW.is_platform_staff_org       := OLD.is_platform_staff_org;
    NEW.seats_included_override     := OLD.seats_included_override;
    NEW.seat_overage_cents_override := OLD.seat_overage_cents_override;
    NEW.trial_ends_at               := OLD.trial_ends_at;
    NEW.canceled_access_ends_at     := OLD.canceled_access_ends_at;
    NEW.stripe_connect_account_id   := OLD.stripe_connect_account_id;
    NEW.stripe_connect_status       := OLD.stripe_connect_status;
    NEW.stripe_connect_charges_enabled := OLD.stripe_connect_charges_enabled;
    NEW.stripe_connect_payouts_enabled := OLD.stripe_connect_payouts_enabled;
    NEW.stripe_connect_livemode     := OLD.stripe_connect_livemode;
    NEW.twilio_account_sid          := OLD.twilio_account_sid;
    NEW.twilio_messaging_service_sid := OLD.twilio_messaging_service_sid;
    NEW.is_demo                     := OLD.is_demo;
    NEW.billing_interval            := OLD.billing_interval;

    IF NEW.oauth_write_roles IS DISTINCT FROM OLD.oauth_write_roles
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles
         WHERE id = auth.uid() AND org_id = OLD.id AND role = 'admin' AND status = 'active'
       )
    THEN
      NEW.oauth_write_roles := OLD.oauth_write_roles;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_stripe_billing_columns() FROM PUBLIC, anon, authenticated;
