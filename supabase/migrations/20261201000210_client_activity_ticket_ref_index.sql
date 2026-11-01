-- Emails sent from a ticket are stored as client_activity rows
-- (activity_type = 'email', ref_table = 'crm_tickets', ref_id = ticket id) so
-- the Resend webhook's delivery/bounce/open stamps apply to them unchanged.
-- The ticket detail sheet reads them back by ticket; this keeps that lookup
-- cheap. No schema change beyond the partial index.
create index if not exists client_activity_ticket_ref_idx
  on public.client_activity (ref_id, occurred_at desc)
  where ref_table = 'crm_tickets';
