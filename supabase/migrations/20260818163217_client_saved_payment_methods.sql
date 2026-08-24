-- Cards/bank accounts kept on file per client for autopay, saved via a Stripe
-- SetupIntent on the org's connected account. These columns are only ever
-- written by the setup-intent save routes (service role) — never exposed
-- through the generic client-edit form.
ALTER TABLE public.clients
  ADD COLUMN stripe_customer_id text,
  ADD COLUMN saved_payment_method_id text,
  ADD COLUMN saved_payment_method_type text
    CHECK (saved_payment_method_type IN ('card', 'us_bank_account')),
  ADD COLUMN saved_payment_method_summary text;
