-- Remember WHICH service a crew suggested, so the office can turn an upsell
-- ticket into an estimate in one click.
--
-- The upsell ticket already names the service in its subject ("Upsell: Hedge
-- Trimming") and body, but only as text — enough for a human, useless for
-- pre-filling an estimate line, which needs the service's id, rate, unit and
-- production rate. Parsing the name back out of the subject would break the
-- moment anyone edits it.
--
-- A nullable column rather than a new crm_ticket_links type: link_type is a
-- shared CHECK constraint (the pattern that silently lost client_activity's
-- 'sms'/'crew_note' values for two weeks), and the links UI renders each link
-- as a navigable record badge, which a service is not.
alter table crm_tickets
  add column if not exists upsell_service_id uuid references crm_services(id) on delete set null;

comment on column crm_tickets.upsell_service_id is
  'Set only on crew-submitted upsell tickets (category = ''Upsell''): the service the crew suggested, so Create estimate can pre-fill a line item. Null on every other ticket.';
