-- Add 'ticket' to comments record_type constraint.
-- Add crm_ticket_links table for associating tickets with estimates, invoices, and jobs.

ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_record_type_check;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_record_type_check
  CHECK (record_type IN ('requisition','po','receiving','project','work_order','job_photo','damage_case','ticket'));

CREATE TABLE IF NOT EXISTS public.crm_ticket_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id),
  ticket_id      uuid NOT NULL REFERENCES public.crm_tickets(id),
  link_type      text NOT NULL CHECK (link_type IN ('estimate','invoice','job')),
  linked_id      uuid NOT NULL,
  linked_label   text,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_ticket_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage ticket_links"
  ON public.crm_ticket_links FOR ALL
  USING (org_id = my_org_id()) WITH CHECK (org_id = my_org_id());
