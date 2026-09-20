-- Backfill surface for the address check (see the "address verification at
-- point of entry" spec in TASKS.md and 20260919030000_address_verification_columns.sql).
--
-- The check runs on blur as addresses are entered, which only ever covers
-- addresses someone touches from now on. Every address already in the system
-- stays unverified until somebody looks at it, and there is no blocking
-- migration that could verify them (each one costs a Google call). This view
-- is how they get found and swept - it is what would surface a pair like
-- "100 Northgate Pkwy" vs "100 Northgate Dr".
--
-- Every hand-entered routable address is here, verified or not, so the report
-- builder can filter rather than the view deciding what counts as a problem.
-- Crew starting addresses are included: a wrong yard address silently skews
-- every optimized route that anchors on it.
--
-- security_invoker = on so RLS on the underlying tables applies to the caller,
-- the same convention the other rpt_* views use (see the 2026-09-03 reports
-- audit, which fixed seven views that bypassed it).

create or replace view public.rpt_address_verification
with (security_invoker = on) as
select
  'Client'::text                                as record_kind,
  c.id                                          as record_id,
  c.display_name                                as client_name,
  null::text                                    as label,
  c.status                                      as client_status,
  c.service_address                             as address,
  c.service_city                                as city,
  c.service_state                               as state,
  c.service_zip                                 as zip,
  coalesce(c.address_verdict, 'never_checked')  as address_verdict,
  c.address_verified_at                         as address_verified_at
from public.clients c
where c.deleted_at is null
  and coalesce(btrim(c.service_address), '') <> ''

union all

select
  'Property'::text,
  p.id,
  c.display_name,
  p.name,
  c.status,
  p.address,
  p.city,
  p.state,
  p.zip,
  coalesce(p.address_verdict, 'never_checked'),
  p.address_verified_at
from public.client_properties p
  join public.clients c on c.id = p.client_id
where p.deleted_at is null
  and c.deleted_at is null
  and coalesce(btrim(p.address), '') <> ''

union all

select
  'Crew Yard'::text,
  w.id,
  null::text,
  w.name,
  null::text,
  w.starting_address,
  w.starting_city,
  w.starting_state,
  w.starting_zip,
  coalesce(w.address_verdict, 'never_checked'),
  w.address_verified_at
from public.crm_crews w
where w.deleted_at is null
  and coalesce(btrim(w.starting_address), '') <> '';

-- Add the dataset to crm_run_report's whitelist WITHOUT restating the
-- function. This repo has repeatedly lost in-DB guards when a later migration
-- re-created a function from a partial copy (see the price-run permission
-- regression and set_job_product_status). Rewriting the live definition means
-- every other check in that function survives by construction, and the anchor
-- assertion makes a silent no-op impossible.
do $outer$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    where p.proname = 'crm_run_report'
      and p.pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'crm_run_report() not found - cannot register rpt_address_verification';
  end if;

  if position('rpt_address_verification' in v_def) > 0 then
    return;
  end if;

  if position('''rpt_audit_log''' in v_def) = 0 then
    raise exception 'crm_run_report() whitelist anchor rpt_audit_log not found - register rpt_address_verification by hand';
  end if;

  v_def := replace(v_def, '''rpt_audit_log''', '''rpt_audit_log'', ''rpt_address_verification''');
  execute v_def;
end $outer$;
