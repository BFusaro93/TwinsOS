-- Adds 'text' as a valid crm_tickets.type value, for tickets auto-created
-- from an inbound SMS reply (src/app/api/webhooks/twilio/inbound). Checked
-- prod's live constraint directly before writing this (only 20260617000006
-- has ever touched crm_tickets_type_check) to avoid the same superset
-- mistake documented for client_activity.activity_type.
ALTER TABLE crm_tickets DROP CONSTRAINT IF EXISTS crm_tickets_type_check;
ALTER TABLE crm_tickets ADD CONSTRAINT crm_tickets_type_check
  CHECK (type IN ('note', 'call', 'event', 'text'));
