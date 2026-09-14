-- A form's sms_optin checkbox can be checked with no phone number submitted
-- (phone isn't always a required field). We can't write TCPA consent with no
-- number to attach it to, but silently dropping the consent isn't right
-- either — flag the ticket so staff know a caller/submitter wants texts and
-- still needs a phone number collected.
alter table crm_tickets
  add column sms_consent_pending_phone boolean not null default false;
