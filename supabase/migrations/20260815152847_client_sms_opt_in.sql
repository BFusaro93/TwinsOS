-- TCPA-required consent gate for outbound SMS. A client is never texted by
-- an automation unless sms_opt_in is explicitly true — default false means
-- every existing client starts opted OUT, not grandfathered in.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_opt_in_source text
    CHECK (sms_opt_in_source IN ('form','verbal','keyword','manual') OR sms_opt_in_source IS NULL);
