-- Full migration making estimates.stage_id the source of truth for estimate
-- pipeline stages, per the intent of 20260624000004_sprint4_estimates_advanced.sql
-- (which added stage_id but never wired anything to write it).
--
-- Root cause of "0 rows in Settings, 7 hardcoded in the estimate UI": every org
-- has zero rows in crm_estimate_stages, and crm_estimate_stages.org_id has no
-- `default my_org_id()` (unlike every other org-scoped table in this codebase),
-- so the app's client-side insert (which never sets org_id explicitly, same as
-- every other mutation hook) hits RLS with org_id = null and silently fails —
-- the Settings > Estimate Stages page has never been able to seed itself.

-- 1. Fix the root insert bug so future inserts (new custom stages via Settings) work.
alter table crm_estimate_stages alter column org_id set default my_org_id();

-- 2. Seed the 7 default stages (matching DEFAULT_STAGES in
--    src/lib/hooks/use-estimate-stages.ts) for every org that has none yet.
insert into crm_estimate_stages (org_id, name, stage_key, probability_bps, sort_order, is_default, is_system, active)
select o.id, s.name, s.stage_key, s.probability_bps, s.sort_order, s.is_default, s.is_system, true
from organizations o
cross join (values
  ('Draft',       'draft',    1000,  0, true,  true),
  ('Quote Ready', 'quote',    3000,  1, false, true),
  ('Sent',        'sent',     5000,  2, false, true),
  ('Approved',    'approved', 7000,  3, false, true),
  ('Won',         'won',      10000, 4, false, true),
  ('Lost',        'lost',     0,     5, false, true),
  ('Invoiced',    'invoiced', 10000, 6, false, true)
) as s(name, stage_key, probability_bps, sort_order, is_default, is_system)
where not exists (
  select 1 from crm_estimate_stages ces
  where ces.org_id = o.id and ces.deleted_at is null
);

-- 3. Backfill estimates.stage_id from the existing stage text for every
--    estimate that doesn't have one yet.
update estimates e
set stage_id = ces.id
from crm_estimate_stages ces
where ces.org_id = e.org_id
  and ces.stage_key = e.stage
  and ces.deleted_at is null
  and e.stage_id is null;

-- 4. Keep stage_id and stage in sync going forward regardless of which one a
--    given write path sets (old code paths only ever set `stage` text; new
--    code should prefer stage_id). stage_id wins when both are provided/changed.
create or replace function public.fn_estimates_sync_stage()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text;
  v_id  uuid;
begin
  if NEW.stage_id is not null
     and (TG_OP = 'INSERT' or NEW.stage_id is distinct from OLD.stage_id)
  then
    select stage_key into v_key from crm_estimate_stages where id = NEW.stage_id;
    if v_key is not null then
      NEW.stage := v_key;
    end if;
  elsif NEW.stage is not null then
    select id into v_id
    from crm_estimate_stages
    where org_id = NEW.org_id and stage_key = NEW.stage and deleted_at is null
    limit 1;
    if v_id is not null then
      NEW.stage_id := v_id;
    end if;
  end if;
  return NEW;
end;
$function$;

do $do$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_estimates_sync_stage') then
    create trigger trg_estimates_sync_stage
      before insert or update on public.estimates
      for each row execute function public.fn_estimates_sync_stage();
  end if;
end
$do$;
