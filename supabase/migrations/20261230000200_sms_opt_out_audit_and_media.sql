-- SMS round 10: when/why texting consent was revoked, and MMS media on inbound texts.
--
-- * crm_sms_opt_outs.source / matched_keyword — how a number got opted out:
--     'keyword'            the text WAS an opt-out keyword ("STOP", "stop please")
--     'keyword_in_message' a longer text CONTAINED one ("please cancel my visit") —
--                          staff should re-confirm; the ticket/activity says so
--     'carrier_blocked'    Twilio error 21610: the number is on Twilio's/the
--                          carrier's opt-out list (it texted STOP at that layer)
--   opted_out_at (existing) is when.
-- * clients.sms_opt_out_at / sms_opt_out_source — the same, for the client's own
--   consent flag (clients.sms_opt_in), set when the PRIMARY phone opts out.
-- * client_activity.media — MMS attachments on an inbound text:
--   [{ "content_type", "twilio_url", "storage_path" (null when not copied) }].
--   storage_path is in the `attachments` bucket; signed URLs are made at read time.

alter table public.crm_sms_opt_outs
  add column if not exists source text not null default 'keyword',
  add column if not exists matched_keyword text;

alter table public.crm_sms_opt_outs drop constraint if exists crm_sms_opt_outs_source_check;
alter table public.crm_sms_opt_outs
  add constraint crm_sms_opt_outs_source_check
  check (source in ('keyword', 'keyword_in_message', 'carrier_blocked'));

alter table public.clients
  add column if not exists sms_opt_out_at timestamptz,
  add column if not exists sms_opt_out_source text;

alter table public.clients drop constraint if exists clients_sms_opt_out_source_check;
alter table public.clients
  add constraint clients_sms_opt_out_source_check
  check (sms_opt_out_source is null or sms_opt_out_source in ('keyword', 'keyword_in_message', 'carrier_blocked', 'manual'));

alter table public.client_activity
  add column if not exists media jsonb;

comment on column public.crm_sms_opt_outs.source is 'keyword | keyword_in_message (re-confirm) | carrier_blocked (Twilio 21610)';
comment on column public.clients.sms_opt_out_at is 'When texting consent was last revoked (STOP from the primary phone, or Twilio 21610 on it).';
comment on column public.client_activity.media is 'Inbound MMS attachments: [{content_type, twilio_url, storage_path}] — storage_path in the attachments bucket, null when not copied.';
