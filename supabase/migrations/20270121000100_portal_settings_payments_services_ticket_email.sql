-- Client portal settings: ticket email to Support Email, autopay / card management
-- toggles, per-method max payment amounts, and service visibility toggles.
--
-- All additive with defaults that preserve today's behavior (everything on, no limits,
-- no extra ticket email), so code and migration can land in either order.
--
--   email_support_on_new_ticket  also email the portal Support Email on every new portal
--                                ticket, in addition to the client's sales rep
--   allow_autopay                clients may turn autopay ON (turning it off is always allowed)
--   allow_card_management        clients may add / update / remove the payment method on file
--   card_max_payment_cents       per-payment ceiling for card payments in the portal (NULL = none)
--   ach_max_payment_cents        per-payment ceiling for bank (ACH) payments (NULL = none)
--   show_upcoming_services       portal shows upcoming visits
--   show_service_history         portal shows completed visits

ALTER TABLE public.client_portal_settings
  ADD COLUMN IF NOT EXISTS email_support_on_new_ticket boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_autopay boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_card_management boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS card_max_payment_cents integer,
  ADD COLUMN IF NOT EXISTS ach_max_payment_cents integer,
  ADD COLUMN IF NOT EXISTS show_upcoming_services boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_service_history boolean NOT NULL DEFAULT true;

ALTER TABLE public.client_portal_settings
  DROP CONSTRAINT IF EXISTS client_portal_settings_card_max_positive,
  ADD CONSTRAINT client_portal_settings_card_max_positive
    CHECK (card_max_payment_cents IS NULL OR card_max_payment_cents > 0),
  DROP CONSTRAINT IF EXISTS client_portal_settings_ach_max_positive,
  ADD CONSTRAINT client_portal_settings_ach_max_positive
    CHECK (ach_max_payment_cents IS NULL OR ach_max_payment_cents > 0);
