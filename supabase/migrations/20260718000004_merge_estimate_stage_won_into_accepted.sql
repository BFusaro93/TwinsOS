-- Merge the 'won' stage into 'accepted' — "Accepted" now means the deal is
-- fully closed (what "Won" used to mean); there is no longer a separate
-- intermediate "won" stage.

-- 1. Repoint any estimate currently on 'won' to 'accepted' (stage_id too).
update estimates e
set stage = 'accepted',
    stage_id = (
      select id from crm_estimate_stages ces
      where ces.org_id = e.org_id and ces.stage_key = 'accepted' and ces.deleted_at is null
      limit 1
    )
where e.stage = 'won';

-- 2. 'Accepted' inherits 'Won's probability (100%) — it's now the terminal
--    closed-deal stage, not the previously-unused intermediate one.
update crm_estimate_stages
set probability_bps = 10000
where stage_key = 'accepted';

-- 3. Soft-delete the now-redundant 'won' stage rows (safe: step 1 already
--    repointed every estimate off of them).
update crm_estimate_stages
set deleted_at = now()
where stage_key = 'won'
  and deleted_at is null;

-- 4. Stop seeding 'Won' for future orgs; seed 'Accepted' at 100%.
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
    (NEW.id, 'Accepted',    'accepted', 10000, 3, false, true, true),
    (NEW.id, 'Lost',        'lost',     0,     4, false, true, true),
    (NEW.id, 'Invoiced',    'invoiced', 10000, 5, false, true, true);
  return NEW;
end;
$function$;
