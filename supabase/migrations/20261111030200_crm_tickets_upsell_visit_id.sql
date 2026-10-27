-- The visit a crew-app upsell suggestion was spotted on. The crew upsell
-- route's 10-minute replay guard matched only (person, service, client), so a
-- second property's suggestion or a follow-up with a new note/photo returned
-- the earlier ticket and was dropped. Matching on the visit (which fixes the
-- property) removes the collision.
alter table public.crm_tickets
  add column if not exists upsell_visit_id uuid references public.crm_job_visits(id);

create index if not exists crm_tickets_upsell_visit_idx
  on public.crm_tickets (upsell_visit_id)
  where upsell_visit_id is not null;
