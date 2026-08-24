-- "Approved" was a confusing name for the stage after "Sent" and before "Won" —
-- rename it to "Accepted" everywhere. This is the pipeline STAGE (crm_estimate_stages
-- / estimates.stage), unrelated to the separate approval_status gate workflow.

-- 1. Rename the existing system stage row for every org.
update crm_estimate_stages
set stage_key = 'accepted', name = 'Accepted'
where stage_key = 'approved';

-- 2. Rename any estimate still holding the old text value.
update estimates
set stage = 'accepted'
where stage = 'approved';

-- 3. Backfill stage_id for any estimate stuck on stage = 'accepted' with no
--    stage_id (this DB previously had no 'accepted' stage_key, so the
--    20260717000005 backfill step skipped these rows entirely).
update estimates e
set stage_id = ces.id
from crm_estimate_stages ces
where ces.org_id = e.org_id
  and ces.stage_key = e.stage
  and ces.deleted_at is null
  and e.stage_id is null;

-- 4. Seed future orgs with "Accepted" instead of "Approved".
create or replace function public.fn_seed_default_estimate_stages()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into crm_estimate_stages (org_id, name, stage_key, probability_bps, sort_order, is_default, is_system, active)
  values
    (NEW.id, 'Draft',       'draft',    1000,  0, true,  true, true),
    (NEW.id, 'Quote Ready', 'quote',    3000,  1, false, true, true),
    (NEW.id, 'Sent',        'sent',     5000,  2, false, true, true),
    (NEW.id, 'Accepted',    'accepted', 7000,  3, false, true, true),
    (NEW.id, 'Won',         'won',      10000, 4, false, true, true),
    (NEW.id, 'Lost',        'lost',     0,     5, false, true, true),
    (NEW.id, 'Invoiced',    'invoiced', 10000, 6, false, true, true);
  return NEW;
end;
$function$;
