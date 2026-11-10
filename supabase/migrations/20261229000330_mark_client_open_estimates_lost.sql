-- Closing a lead as Lost or cancelling a client now asks "Mark the N open
-- estimates as Lost?" (owner decision 2026-11). This RPC backs both the count
-- (p_apply = false) and the write (p_apply = true), for one client or a bulk
-- selection.
--
-- "Open" = stage not accepted / lost / invoiced (crm_estimate_stages' fixed
-- keys; draft, quote, sent and any org-added stage count as open). An estimate
-- that already has a live job or a non-void invoice is skipped — the same rule
-- useUpdateEstimateStage applies before a manual move to Lost.
--
-- SECURITY INVOKER: the caller's RLS and the estimate write-permission trigger
-- (estimate_edit) apply exactly as for a manual stage change. Each estimate
-- gets the org's Lost probability, the close reason (when given) and an
-- "Estimate lost" timeline entry on its client. The estimate_lost automation is
-- deliberately not fired for this cascade — the client's own lead_cancelled /
-- client_cancelled trigger already fires for the same event.

create or replace function public.crm_mark_client_open_estimates_lost(
  p_client_ids uuid[],
  p_apply boolean default false,
  p_reason text default null
)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_ids uuid[];
  v_count integer;
begin
  if coalesce(array_length(p_client_ids, 1), 0) = 0 then
    return 0;
  end if;
  if array_length(p_client_ids, 1) > 1000 then
    raise exception 'At most 1000 clients at a time' using errcode = '22023';
  end if;

  select coalesce(array_agg(e.id), '{}')
    into v_ids
    from public.estimates e
   where e.client_id = any(p_client_ids)
     and e.org_id = public.my_org_id()
     and e.deleted_at is null
     and coalesce(e.stage, '') not in ('accepted', 'lost', 'invoiced')
     and not exists (
       select 1 from public.crm_jobs j
        where j.estimate_id = e.id and j.deleted_at is null and j.status is distinct from 'cancelled')
     and not exists (
       select 1 from public.crm_invoices i
        where i.estimate_id = e.id and i.deleted_at is null and i.status is distinct from 'void');

  if not p_apply then
    return coalesce(array_length(v_ids, 1), 0);
  end if;
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return 0;
  end if;

  update public.estimates e
     set stage = 'lost',
         probability_bps = coalesce(
           (select s.probability_bps from public.crm_estimate_stages s
             where s.org_id = e.org_id and s.stage_key = 'lost' and s.deleted_at is null
             limit 1),
           e.probability_bps),
         reason = coalesce(nullif(btrim(p_reason), ''), e.reason)
   where e.id = any(v_ids)
     and coalesce(e.stage, '') not in ('accepted', 'lost', 'invoiced');
  get diagnostics v_count = row_count;

  insert into public.client_activity (client_id, activity_type, subject, ref_id, ref_table, created_by)
  select e.client_id, 'estimate', 'Estimate lost', e.id, 'estimates', auth.uid()
    from public.estimates e
   where e.id = any(v_ids) and e.stage = 'lost';

  return v_count;
end;
$function$;

revoke all on function public.crm_mark_client_open_estimates_lost(uuid[], boolean, text) from public, anon;
grant execute on function public.crm_mark_client_open_estimates_lost(uuid[], boolean, text) to authenticated, service_role;
