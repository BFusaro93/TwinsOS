-- The client portal's ticket list (src/app/api/portal/tickets/route.ts) was
-- showing every crm_tickets row tied to client_id, including staff-created,
-- automation-generated, and public-form-generated tickets that were never
-- meant to be client-facing (raw form dumps, internal collections notes,
-- etc) — crm_tickets had no column to distinguish "the client should see
-- this" from "internal only". Default false so every existing/staff/
-- automation/form-created ticket stays internal unless explicitly marked
-- client-facing; the portal's own ticket-submission endpoint sets this true
-- for the tickets a client creates themselves, so they can still track them.
alter table crm_tickets
  add column visible_to_client boolean not null default false;

create index on crm_tickets (client_id, visible_to_client) where deleted_at is null;
