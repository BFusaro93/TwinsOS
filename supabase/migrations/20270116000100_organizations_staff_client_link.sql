-- Subscriber orgs are tracked as clients (and demo requests as leads) inside the
-- platform staff org, so staff can market to them, run automations, open tickets
-- and keep one activity timeline per subscriber.
--
-- organizations.staff_client_id points at the staff org's `clients` row that
-- mirrors this org. The org is the source of truth; the client is a projection
-- written only by service-role code (src/lib/staff/subscriber-clients.ts).
-- One-way link: nothing on the client side points back at the tenant org, and
-- tenants never read it (the column is reset for every non-service-role writer
-- by protect_stripe_billing_columns, re-stated in full below).
--
-- ON DELETE SET NULL: soft-deleting is the norm, but a hard delete of the client
-- must not orphan or block the org row.

alter table public.organizations
  add column if not exists staff_client_id uuid references public.clients(id) on delete set null;

create unique index if not exists organizations_staff_client_id_key
  on public.organizations (staff_client_id)
  where staff_client_id is not null;

comment on column public.organizations.staff_client_id is
  'Staff-org clients row that mirrors this subscriber org. Written only by service-role code; reset for every other writer by protect_stripe_billing_columns().';

-- Re-stated in full from the live definition (20270101000510); every existing
-- column and the oauth_write_roles admin-only guard are kept.
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
    NEW.trial_reminders_sent        := OLD.trial_reminders_sent;
    NEW.staff_client_id             := OLD.staff_client_id;

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
