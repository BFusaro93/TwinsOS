-- Bundle (estimate template) sub-items get their own Visits, like estimate sub-items
-- (20270101000800): total = qty x rate x visits. Default 1 keeps every existing bundle
-- exactly as it was (charged once for the whole line).
alter table public.estimate_template_item_subitems
  add column if not exists visits integer not null default 1;
alter table public.estimate_template_item_subitems
  drop constraint if exists estimate_template_item_subitems_visits_check;
alter table public.estimate_template_item_subitems
  add constraint estimate_template_item_subitems_visits_check check (visits >= 1);

notify pgrst, 'reload schema';
