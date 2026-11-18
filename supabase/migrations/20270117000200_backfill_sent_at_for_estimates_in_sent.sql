-- Round 15 open item: estimates sitting in Sent with no sent date.
--
-- "Estimate expiring" and "No response" reminders only consider estimates with a
-- sent_at. Estimates that reached Sent without one — imported from another system
-- already in Sent, or moved to Sent by hand before the round-15 fix — were invisible
-- to both. On PROD on 11/18 that is 42 estimates: 41 Service Autopilot imports in one
-- org (each with its original estimate date) and 1 in the sandbox.
--
-- They get sent_at = their own estimate date, at noon in the org's time zone. The
-- import now sets it the same way (useBulkImportEstimates), and every other path into
-- Sent sets it when it happens.
--
-- Data only; nothing is sent by this. The "Estimate was sent" trigger fires from the
-- app's move into Sent, not from this column, so no follow-up starts here. Idempotent:
-- only rows still missing a sent date are touched.

update public.estimates e
   set sent_at = ((e.estimate_date + time '12:00') at time zone coalesce(nullif(o.timezone, ''), 'America/New_York'))
  from public.organizations o
 where o.id = e.org_id
   and e.stage = 'sent'
   and e.sent_at is null
   and e.estimate_date is not null
   and e.deleted_at is null;
