-- Sub-items get their own Visits, like the main estimate line: total = qty x rate x visits.
-- Default 1 keeps every existing sub-item exactly as it was (charged once, for the whole line);
-- set it to the line's visits to charge a sub-service on every visit.
alter table public.estimate_line_item_subitems
  add column if not exists visits integer not null default 1;
alter table public.estimate_line_item_subitems
  drop constraint if exists estimate_line_item_subitems_visits_check;
alter table public.estimate_line_item_subitems
  add constraint estimate_line_item_subitems_visits_check check (visits >= 1);

-- Snapshot on the job's copy of the sub-item (invoice itemizing reads it).
alter table public.crm_job_service_subitems
  add column if not exists visits integer not null default 1;

notify pgrst, 'reload schema';
