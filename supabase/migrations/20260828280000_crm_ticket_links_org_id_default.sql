-- crm_ticket_links.org_id had no DEFAULT my_org_id(), so every insert (client-side
-- mutations never set org_id explicitly) violated RLS. Bring it in line with every
-- other org-scoped table's convention.

ALTER TABLE public.crm_ticket_links ALTER COLUMN org_id SET DEFAULT my_org_id();
