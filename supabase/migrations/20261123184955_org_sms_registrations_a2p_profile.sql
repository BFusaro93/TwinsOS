-- The A2P Messaging Profile (a Trust Hub "Trust Product", SID BU...) that
-- Brand Registration takes as A2PProfileBundleSid, separate from the business
-- identity Customer Profile in twilio_customer_profile_sid. Saved so a retry
-- after a failed brand request reuses the already-submitted bundle instead of
-- creating another.
alter table org_sms_registrations
  add column if not exists twilio_a2p_profile_sid text;
