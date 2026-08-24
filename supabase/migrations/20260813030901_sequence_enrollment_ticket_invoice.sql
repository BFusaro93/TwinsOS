-- Add ticket_id and invoice_id to crm_sequence_enrollments, mirroring the
-- existing estimate_id column, so ticket_*/invoice_* stop-conditions can be
-- evaluated against the specific ticket/invoice that enrolled the client for
-- the lifetime of the enrollment (not just at the moment the trigger fired).
ALTER TABLE crm_sequence_enrollments
  ADD COLUMN IF NOT EXISTS ticket_id   uuid REFERENCES crm_tickets(id),
  ADD COLUMN IF NOT EXISTS invoice_id  uuid REFERENCES crm_invoices(id);
