-- Bug sweep round 14 (F7): snow automation tags read the wrong property.
--
-- [stormname] / [snowcrew] / [snowstatus] / [snowaddress] … were read from the
-- client's LATEST snow visit in the last week, because an enrollment only knew
-- its client. A client with several properties could get another site's crew,
-- status and address. Enrollments fired by a visit event (visit completed /
-- dispatched / skipped / cancelled) now remember that visit, and the snow tags
-- read it; enrollments without one keep the latest-visit fallback.
--
-- Nullable, no backfill: older enrollments simply have no visit.

alter table public.crm_sequence_enrollments
  add column if not exists visit_id uuid references public.crm_job_visits(id) on delete set null;

comment on column public.crm_sequence_enrollments.visit_id is
  'The visit a visit-event trigger (visit_completed, visit_dispatched, …) fired for — the snow merge tags read this stop.';
