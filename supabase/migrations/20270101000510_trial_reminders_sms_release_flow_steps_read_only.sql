-- Round 12: trial / SaaS-billing follow-ups.
--
-- 1. organizations.trial_reminders_sent — which trial-ending reminder emails
--    (/api/cron/trial-reminders: '7d', '1d') were already sent to the org's
--    admins, as { "<key>": "<sent at>" }. The cron claims a key with a
--    conditional update before sending, so a re-run or a parallel run never
--    emails twice. Service-role only: protect_stripe_billing_columns() resets it
--    for every other writer (re-stated in full from the live TEST definition =
--    20261229000500, every existing column and the oauth_write_roles guard kept).
--
-- 2. org_sms_registrations.released_at / released_reason / release_error —
--    when the org's texting number + campaign were released at Twilio because
--    the subscription was canceled or the SMS add-on removed
--    (releaseOrgSmsResources in src/lib/twilio/provisioning.ts), and the last
--    failed release attempt, for support.
--
-- 3. approval_flow_steps has no org_id, so the read-only (canceled / ended
--    trial) RESTRICTIVE policies from 20260926190000 never reached it: a
--    read-only org's admin could still edit its approval chains' steps. Its
--    rows are only reachable through approval_flows of my_org_id() (every
--    permissive policy filters on that), so the same my_org_is_read_only()
--    check applies. Existing access rules are unchanged.

alter table public.organizations
  add column if not exists trial_reminders_sent jsonb not null default '{}'::jsonb;

comment on column public.organizations.trial_reminders_sent is
  'Trial-ending reminder emails already sent to admins: {"7d": ts, "1d": ts}. Written only by /api/cron/trial-reminders (service role).';

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

alter table public.org_sms_registrations
  add column if not exists released_at timestamptz,
  add column if not exists released_reason text,
  add column if not exists release_error text;

alter table public.org_sms_registrations
  drop constraint if exists org_sms_registrations_released_reason_check;
alter table public.org_sms_registrations
  add constraint org_sms_registrations_released_reason_check
  check (released_reason is null or released_reason in ('subscription_canceled', 'sms_addon_removed'));

drop policy if exists read_only_when_canceled_ins on public.approval_flow_steps;
drop policy if exists read_only_when_canceled_upd on public.approval_flow_steps;
drop policy if exists read_only_when_canceled_del on public.approval_flow_steps;
create policy read_only_when_canceled_ins on public.approval_flow_steps as restrictive for insert
  with check ((select public.my_org_is_read_only()) is not true);
create policy read_only_when_canceled_upd on public.approval_flow_steps as restrictive for update
  using ((select public.my_org_is_read_only()) is not true)
  with check ((select public.my_org_is_read_only()) is not true);
create policy read_only_when_canceled_del on public.approval_flow_steps as restrictive for delete
  using ((select public.my_org_is_read_only()) is not true);

notify pgrst, 'reload schema';
