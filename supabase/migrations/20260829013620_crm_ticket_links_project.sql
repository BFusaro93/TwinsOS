-- Allow tickets to link to Projects, in addition to estimates/invoices/jobs.

ALTER TABLE public.crm_ticket_links DROP CONSTRAINT IF EXISTS crm_ticket_links_link_type_check;
ALTER TABLE public.crm_ticket_links
  ADD CONSTRAINT crm_ticket_links_link_type_check
  CHECK (link_type IN ('estimate','invoice','job','project'));
