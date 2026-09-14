-- Companion to 20260717000005: that migration backfilled default estimate
-- stages for existing orgs, but any org created AFTER it would hit the same
-- "0 rows in Settings" gap all over again. Auto-seed on organization creation.
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
    (NEW.id, 'Approved',    'approved', 7000,  3, false, true, true),
    (NEW.id, 'Won',         'won',      10000, 4, false, true, true),
    (NEW.id, 'Lost',        'lost',     0,     5, false, true, true),
    (NEW.id, 'Invoiced',    'invoiced', 10000, 6, false, true, true);
  return NEW;
end;
$function$;

do $do$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_seed_default_estimate_stages') then
    create trigger trg_seed_default_estimate_stages
      after insert on public.organizations
      for each row execute function public.fn_seed_default_estimate_stages();
  end if;
end
$do$;
