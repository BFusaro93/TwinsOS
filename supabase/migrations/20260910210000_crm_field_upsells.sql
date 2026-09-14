-- Field upsells: let a crew flag work they've spotted at a property.
--
-- Deliberately NO new tables. An upsell is captured as a normal crm_tickets row
-- with category 'Upsell', which inherits assignment, due dates, priority,
-- comments, the Tickets list and its filters, ticket automations (which already
-- match on category), the audit trail, and attachments — `attachments` already
-- accepts record_type 'ticket', so the crew's photo needs no schema change.
--
-- The sales pipeline is NOT duplicated onto the ticket either. Whether an
-- upsell earned anything is the stage of the estimate it turns into
-- (crm_estimate_stages already runs Draft → Sent → Accepted → Won/Lost with
-- probability weighting), linked through crm_ticket_links.link_type 'estimate'.
-- Ticket status open/closed only ever means "has the office dealt with it".
--
-- What this migration adds is the curated list: crews pick from services the
-- office has explicitly opened up, not the whole catalog. Same pattern as the
-- existing crm_services.show_in_snow_dispatch / only_for_estimates flags.

alter table crm_services
  add column if not exists show_in_field_upsells boolean not null default false;

-- Crew-facing prompt for what to look for ("Beds look thin? Suggest a
-- top-dress"). Shown under the service name in the crew app, so it can carry
-- the sales cue the office would otherwise have to train verbally.
alter table crm_services
  add column if not exists upsell_pitch text;

comment on column crm_services.show_in_field_upsells is
  'Crews can suggest this service from the crew app. With none flagged, the Suggest work button is hidden entirely — this doubles as the feature on/off switch, so no separate permission key exists.';
