-- Report Center dataset for crew-submitted field upsells.
--
-- The question this answers is "are field suggestions turning into money, and
-- which crews are spotting them" — so the outcome column does NOT come from the
-- ticket's own open/closed status (which only means "has the office dealt with
-- it"). It comes from the stage of the estimate the ticket was linked to, which
-- is where the real pipeline lives.
create or replace view rpt_upsells with (security_invoker = on) as
with linked_estimate as (
  -- A ticket can carry several links; only estimates matter here, and the most
  -- recent one is the live quote if somebody re-quoted the work.
  select distinct on (l.ticket_id)
    l.ticket_id,
    e.id            as estimate_id,
    e.estimate_number,
    e.stage         as estimate_stage,
    e.total_cents   as estimate_total_cents
  from crm_ticket_links l
  join estimates e on e.id = l.linked_id and e.deleted_at is null
  where l.link_type = 'estimate'
  order by l.ticket_id, l.created_at desc
)
select
  t.id,
  t.ticket_number,
  t.created_at                       as submitted_at,
  c.display_name                     as client_name,
  coalesce(s.name, replace(t.subject, 'Upsell: ', '')) as service_suggested,
  -- Who spotted it. profiles.name is the crew login's own name; crews are
  -- matched through crm_crews.user_id so a per-crew leaderboard is possible
  -- even though the ticket itself has no crew column.
  coalesce(p.name, p.email)          as submitted_by,
  cw.name                            as crew_name,
  t.status                           as ticket_status,
  t.body                             as crew_note,
  le.estimate_number,
  le.estimate_stage,
  le.estimate_total_cents,
  -- One plain-English outcome, so the report is readable without knowing the
  -- stage vocabulary. 'invoiced' counts as won — it is a won estimate that has
  -- already been billed.
  case
    when le.estimate_id is null              then 'Not quoted'
    when le.estimate_stage in ('won', 'invoiced', 'accepted') then 'Won'
    when le.estimate_stage = 'lost'          then 'Lost'
    else 'Quoted'
  end                                as outcome,
  -- Only realised money, so summing this column across a date range gives
  -- revenue actually sourced from the field rather than hopeful pipeline.
  case
    when le.estimate_stage in ('won', 'invoiced', 'accepted')
      then coalesce(le.estimate_total_cents, 0)
    else 0
  end                                as won_revenue_cents
from crm_tickets t
left join clients     c  on c.id = t.client_id
left join crm_services s on s.id = t.upsell_service_id
left join profiles    p  on p.id = t.created_by
left join crm_crews   cw on cw.user_id = t.created_by and cw.deleted_at is null
left join linked_estimate le on le.ticket_id = t.id
where t.category = 'Upsell'
  and t.deleted_at is null;

-- ── whitelist rpt_upsells on crm_run_report ─────────────────────────────────
-- Deliberately NOT a CREATE OR REPLACE of the whole function, which is the
-- pattern earlier rpt_* migrations used. crm_run_report's live body differs
-- between PROD and TEST (8195 vs 7801 chars as of 2026-09-13, same whitelist
-- but different bodies), so replacing it wholesale from either environment's
-- snapshot would silently overwrite the other's version of a security-critical
-- function — it validates every dataset, column, operator and aggregate the
-- Report Center passes through.
--
-- This edits only the whitelist array in whatever body each environment
-- actually has, is a no-op if rpt_upsells is already listed, and raises rather
-- than silently doing nothing if the anchor text is missing.
do $$
declare
  v_def text;
  v_anchor constant text := '''rpt_contract_service_usage'', ''rpt_crew_drive_time''';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'crm_run_report'
  limit 1;

  if v_def is null then
    raise exception 'crm_run_report not found — cannot whitelist rpt_upsells';
  end if;

  if position('rpt_upsells' in v_def) > 0 then
    return;
  end if;

  if position(v_anchor in v_def) = 0 then
    raise exception
      'crm_run_report whitelist anchor not found — its body has changed; add rpt_upsells to v_allowed_datasets by hand';
  end if;

  v_def := replace(v_def, v_anchor, v_anchor || ', ''rpt_upsells''');
  execute v_def;
end $$;
