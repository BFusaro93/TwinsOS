-- One Twilio Messaging Service belongs to at most one org. The inbound SMS
-- webhook resolves the receiving org from MessagingServiceSid; a SID shared by
-- two orgs would make that lookup ambiguous (a reply — and a STOP — could be
-- filed against the wrong tenant). NULL = the org uses the platform's shared
-- sender, which is resolved separately (SHARED_TWILIO_ORG_ID).
create unique index if not exists organizations_twilio_messaging_service_sid_key
  on public.organizations (twilio_messaging_service_sid)
  where twilio_messaging_service_sid is not null;
