-- Individual client email + bulk campaign sending:
-- - unsubscribe_token backs the public one-click unsubscribe link embedded in
--   the CAN-SPAM footer of bulk campaign emails.
-- - audience_client_ids backs the "custom" campaign target_segment (explicit
--   client picker) rather than reimplementing the generic client filter UI
--   server-side.
alter table clients
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

alter table crm_campaigns
  add column if not exists audience_client_ids uuid[] not null default '{}';
