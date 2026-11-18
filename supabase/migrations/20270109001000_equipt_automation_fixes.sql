-- Equipt (CMMS) automation fixes — bug sweep round 15b, area E.
--
-- 1. Saved rule values the database never accepted:
--    * po_status_change rules offered requisition-style statuses. Map them onto the real
--      purchase_orders.status values: pending_approval -> pending, closed -> completed.
--      "draft" matches no PO status (a new PO starts as "requested" without a status
--      change), so those rules could never fire: they are switched OFF (no behaviour
--      change) and re-pointed at "requested" so the dialog shows a real option.
--    * create_work_order / create_wo_request rules saved priority "urgent", which
--      work_orders / maintenance_requests reject (low/medium/high/critical). -> critical.
--    The app maps the old values at run time too, so code and data can deploy in either order.
--
-- 2. Decision 11: pm_due and wo_overdue fire PER RECORD instead of once per rule.
--    automation_record_firings records what each rule already fired for:
--      pm_due      -> (record_type 'pm_schedule', record_id = schedule, record_key = its next_due_date)
--                     so it fires once each time a schedule comes due and re-arms when the
--                     schedule's next_due_date advances;
--      wo_overdue  -> (record_type 'work_order', record_id = WO, record_key = '') — once per WO.
--    The runner claims a row with claim_automation_record_firing() (service role only)
--    BEFORE acting, so overlapping runs can't double-fire, and marks it fired / failed
--    after. A failed (retryable) or abandoned (>10 min claimed) row can be claimed again.
--    pending_reset is no longer used by these two trigger types; existing rows are left as
--    they are (the runner ignores it for them).
--
-- PROD: apply BEFORE the code deploy (the new runner needs the table + RPC; until the code
-- ships nothing reads them). Section 1 is safe before or after.
--   Effect on PROD at deploy: the real org's enabled pm_due -> send_notification rule
--   (days_ahead 5, technician), stuck with pending_reset = true since 9/29, starts firing
--   again: one notification per PM schedule that is currently due within 5 days (or
--   overdue) and not paused — ~7 on the first run — then one per schedule each time it
--   comes due again. Its pending_reset flag is left untouched (ignored now).
-- PRE-CHECK on PROD (expect: the one pm_due rule; any wo_overdue rule will fire once per
-- currently-overdue open WO, max 25 per rule per 15-minute run):
--   select a.id, a.org_id, a.name, a.trigger_type, a.action_type, a.trigger_config, a.pending_reset
--     from automations a
--    where a.trigger_type in ('pm_due', 'wo_overdue') and a.enabled and a.deleted_at is null;
--   select trigger_type, trigger_config->>'to_status', action_config->>'priority', count(*)
--     from automations where deleted_at is null group by 1, 2, 3;

-- ── 1. Legacy rule values ────────────────────────────────────────────────────

update public.automations
   set trigger_config = jsonb_set(trigger_config, '{to_status}',
         to_jsonb(case trigger_config->>'to_status' when 'pending_approval' then 'pending' else 'completed' end)),
       updated_at = now()
 where trigger_type = 'po_status_change'
   and trigger_config->>'to_status' in ('pending_approval', 'closed');

update public.automations
   set trigger_config = jsonb_set(trigger_config, '{to_status}', to_jsonb('requested'::text)),
       enabled = false,
       updated_at = now()
 where trigger_type = 'po_status_change'
   and trigger_config->>'to_status' = 'draft';

update public.automations
   set action_config = jsonb_set(action_config, '{priority}', to_jsonb('critical'::text)),
       updated_at = now()
 where action_type in ('create_work_order', 'create_wo_request')
   and action_config->>'priority' = 'urgent';

-- ── 2. Per-record firing log ─────────────────────────────────────────────────

create table if not exists public.automation_record_firings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id),
  automation_id uuid not null references public.automations(id),
  record_type   text not null check (record_type in ('pm_schedule', 'work_order')),
  record_id     uuid not null,
  -- What makes this firing distinct for the record: a PM schedule's next_due_date
  -- (so it re-arms when the schedule advances); '' for once-per-record.
  record_key    text not null default '',
  status        text not null default 'claimed' check (status in ('claimed', 'fired', 'failed')),
  result        text,
  claimed_at    timestamptz not null default now(),
  fired_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  deleted_at    timestamptz,
  constraint automation_record_firings_unique unique (automation_id, record_type, record_id, record_key)
);

create index if not exists automation_record_firings_org_idx
  on public.automation_record_firings (org_id, automation_id);

alter table public.automation_record_firings enable row level security;

-- Readable by the org (for a future "fired for" view); written only by the service-role
-- runner — no insert/update/delete policies, and no table grants beyond SELECT.
drop policy if exists org_members_read_automation_record_firings on public.automation_record_firings;
create policy org_members_read_automation_record_firings
  on public.automation_record_firings
  for select to authenticated
  using (org_id = (select public.my_org_id()) and deleted_at is null);

revoke all on public.automation_record_firings from anon, authenticated;
grant select on public.automation_record_firings to authenticated;
grant all on public.automation_record_firings to service_role;

/**
 * Claims one (rule, record, key) firing for the runner. Returns the firing id when the
 * caller won the claim, NULL when it was already fired or is being fired by another run.
 * A 'failed' firing, or one left 'claimed' for over 10 minutes (the run died), is
 * re-claimable. Service role only.
 */
create or replace function public.claim_automation_record_firing(
  p_automation_id uuid,
  p_record_type text,
  p_record_id uuid,
  p_record_key text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  select org_id into v_org from public.automations where id = p_automation_id;
  if v_org is null then
    raise exception 'automation % not found', p_automation_id;
  end if;

  insert into public.automation_record_firings
    (org_id, automation_id, record_type, record_id, record_key, status, claimed_at)
  values (v_org, p_automation_id, p_record_type, p_record_id, coalesce(p_record_key, ''), 'claimed', now())
  on conflict (automation_id, record_type, record_id, record_key) do update
     set status = 'claimed', claimed_at = now(), result = null, updated_at = now()
   where automation_record_firings.status = 'failed'
      or (automation_record_firings.status = 'claimed'
          and automation_record_firings.claimed_at < now() - interval '10 minutes')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.claim_automation_record_firing(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_automation_record_firing(uuid, text, uuid, text) to service_role;

notify pgrst, 'reload schema';
