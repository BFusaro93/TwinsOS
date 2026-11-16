-- Bug sweep round 14 (4xx): estimate approval gate (owner decision) + F5.
--
-- Approval used to block only Send and the share link. Accept (office click,
-- proposal page, portal), Convert to Job and Invoice all went around it, so an
-- estimate still waiting for (or refused) approval could be sold, scheduled
-- and billed. Decision: block all three while the estimate needs approval and
-- isn't approved, unless the person doing it could approve it themselves.
--
-- "Needs approval" (_estimate_approval_block_reason):
--   * approval_status 'pending' or 'rejected';
--   * 'approved', but the amount approval covers (approval_amount_cents, the
--     highest Good/Better/Best tier) grew past what was approved — the same
--     rule the send-email and share-link routes use;
--   * 'not_required' (never submitted) while the org's estimate approval flow
--     has a step whose threshold this amount meets.
-- "Could approve it" (_estimate_user_can_approve): an active admin; or, while
-- the chain is pending, someone who can decide every pending step (the step's
-- approver, or a manager standing in on a non-admin step — decide_approval's
-- rule). A customer (proposal / portal accept, service role) never can.
--
-- Enforced in the database so every path is covered:
--   * estimates: stage moving to 'accepted';
--   * crm_jobs: a job created for (or re-linked to) an estimate;
--   * crm_invoices: a new invoice carrying estimate_id (not for the re-issue of
--     a voided invoice: crm_duplicate_void_invoice sets app.invoice_reissue).
-- estimate_approval_gate() lets the UI disable the buttons with the reason.
--
-- F5: a new invoice carrying estimate_id is also refused when the estimate has
-- a live non-project job (it bills through the job's own invoices), when a
-- CANCELLED non-project job of the estimate already billed visits on a live
-- invoice (the client-side check skipped cancelled jobs, so the whole estimate
-- could be billed again), or when the estimate is marked Lost. This mirrors
-- fn_crm_jobs_estimate_billing_guard, which covers the other direction.
--
-- PROD: apply AFTER the code deploys is safest for the UI (new code reads
-- estimate_approval_gate; old code would just see the new errors), but the
-- guards are what the owner decided, so BEFORE is acceptable too. Pre-check on
-- PROD (how many open estimates become blocked):
--   select e.org_id, count(*) from estimates e
--    where e.deleted_at is null and e.stage in ('draft','quote','sent','accepted')
--      and public._estimate_approval_block_reason(e.id) is not null group by 1;

create or replace function public._estimate_approval_block_reason(p_estimate_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_org      uuid;
  v_status   text;
  v_amount   integer;
  v_approved integer;
  v_flow     uuid;
  v_stage    text;
begin
  select e.org_id, e.approval_status, coalesce(e.approval_amount_cents, e.total_cents, 0), e.stage
    into v_org, v_status, v_amount, v_stage
    from public.estimates e
   where e.id = p_estimate_id;
  if not found then
    return null;
  end if;

  if v_status = 'pending' then
    return 'This estimate is waiting for approval.';
  elsif v_status = 'rejected' then
    return 'This estimate''s approval was rejected — resubmit it for approval.';
  elsif v_status = 'approved' then
    select max(a.entity_total_cents) into v_approved
      from public.approval_requests a
     where a.entity_type = 'crm_estimate' and a.entity_id = p_estimate_id
       and not a.archived and a.status = 'approved';
    if v_approved is not null and v_amount > v_approved then
      return format('This estimate was approved at %s and now totals %s — resubmit it for approval.',
        to_char(v_approved / 100.0, 'FM$999,999,990.00'), to_char(v_amount / 100.0, 'FM$999,999,990.00'));
    end if;
    return null;
  end if;

  -- Never submitted, but already accepted: acceptance itself is gated (the
  -- estimates trigger runs BEFORE UPDATE, so the stored stage is still the old
  -- one while an acceptance is being checked), so an estimate that is already
  -- 'accepted' passed the gate — or was accepted before the gate existed. Don't
  -- block converting / invoicing it after the fact.
  if v_stage = 'accepted' then
    return null;
  end if;

  -- Never submitted: does the org's flow require approval at this amount?
  select f.id into v_flow
    from public.approval_flows f
   where f.org_id = v_org and f.entity_type = 'crm_estimate' and f.deleted_at is null
   order by f.created_at, f.id
   limit 1;
  if v_flow is not null and exists (
       select 1 from public.approval_flow_steps s
        where s.flow_id = v_flow
          and (s.threshold_cents = 0 or v_amount >= s.threshold_cents)) then
    return 'This estimate needs approval — submit it for approval (Send does this) first.';
  end if;
  return null;
end;
$function$;

create or replace function public._estimate_user_can_approve(p_estimate_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_role   text;
  v_org    uuid;
  v_status text;
begin
  if v_uid is null then
    return false;
  end if;
  select p.role, p.org_id into v_role, v_org
    from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null then
    return false;
  end if;
  select e.approval_status into v_status
    from public.estimates e where e.id = p_estimate_id and e.org_id = v_org;
  if not found then
    return false;
  end if;
  if v_role = 'admin' then
    return true;
  end if;
  if v_status is distinct from 'pending' then
    return false;
  end if;
  -- Every pending step has a row this user could decide (decide_approval's rule).
  return exists (
           select 1 from public.approval_requests a
            where a.entity_type = 'crm_estimate' and a.entity_id = p_estimate_id
              and not a.archived and a.status = 'pending')
     and not exists (
           select 1 from public.approval_requests a
            where a.entity_type = 'crm_estimate' and a.entity_id = p_estimate_id
              and not a.archived and a.status = 'pending'
            group by coalesce(a.flow_step_id::text, a.id::text)
           having not bool_or(a.approver_id = v_uid
                              or (v_role = 'manager' and a.approver_role is distinct from 'admin')));
end;
$function$;

-- Raises when the estimate needs approval and the current user can't approve it.
create or replace function public._estimate_approval_guard(p_estimate_id uuid, p_action text)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_reason text;
begin
  -- In-database maintenance (no JWT at all: migrations, backfills) is not a
  -- person accepting or billing anything. Service-role callers (the proposal
  -- and portal accept routes, the public API) are still gated.
  if auth.role() is null and auth.uid() is null then
    return;
  end if;
  v_reason := public._estimate_approval_block_reason(p_estimate_id);
  if v_reason is null or public._estimate_user_can_approve(p_estimate_id) then
    return;
  end if;
  raise exception '% It can''t be % until it''s approved.', v_reason, p_action
    using errcode = 'P0001';
end;
$function$;

-- For the UI: { blocked, reason, can_override }.
create or replace function public.estimate_approval_gate(p_estimate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_org    uuid;
  v_reason text;
begin
  select org_id into v_org from public.estimates where id = p_estimate_id and deleted_at is null;
  if v_org is null or public._org_mismatch(v_org) then
    raise exception 'Estimate not found' using errcode = 'P0002';
  end if;
  v_reason := public._estimate_approval_block_reason(p_estimate_id);
  return jsonb_build_object(
    'blocked', v_reason is not null,
    'reason', v_reason,
    'can_override', v_reason is not null and public._estimate_user_can_approve(p_estimate_id)
  );
end;
$function$;

revoke all on function public._estimate_approval_block_reason(uuid) from public, anon, authenticated;
revoke all on function public._estimate_user_can_approve(uuid) from public, anon, authenticated;
revoke all on function public._estimate_approval_guard(uuid, text) from public, anon, authenticated;
grant execute on function public._estimate_approval_block_reason(uuid) to service_role;
grant execute on function public._estimate_user_can_approve(uuid) to service_role;
grant execute on function public._estimate_approval_guard(uuid, text) to service_role;
revoke all on function public.estimate_approval_gate(uuid) from public, anon;
grant execute on function public.estimate_approval_gate(uuid) to authenticated, service_role;

-- ── Accept ────────────────────────────────────────────────────────────────────
create or replace function public.guard_estimate_accept_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.stage = 'accepted' and old.stage is distinct from 'accepted' and new.deleted_at is null then
    perform public._estimate_approval_guard(new.id, 'accepted');
  end if;
  return new;
end;
$function$;

-- Named to run after trg_estimates_sync_stage (BEFORE triggers fire by name).
drop trigger if exists zy_estimates_accept_approval_gate on public.estimates;
create trigger zy_estimates_accept_approval_gate
  before update on public.estimates
  for each row execute function public.guard_estimate_accept_approval();

-- ── Convert to job ───────────────────────────────────────────────────────────
create or replace function public.guard_estimate_job_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.estimate_id is null or new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.estimate_id is not distinct from old.estimate_id then
    return new;
  end if;
  perform public._estimate_approval_guard(new.estimate_id, 'converted to a job');
  return new;
end;
$function$;

drop trigger if exists zy_crm_jobs_estimate_approval_gate on public.crm_jobs;
create trigger zy_crm_jobs_estimate_approval_gate
  before insert or update of estimate_id on public.crm_jobs
  for each row execute function public.guard_estimate_job_approval();

-- ── Invoice from an estimate (approval + F5) ─────────────────────────────────
create or replace function public.guard_estimate_invoice_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stage   text;
  v_number  text;
  v_reissue boolean := coalesce(current_setting('app.invoice_reissue', true), '') = 'on';
begin
  if new.estimate_id is null or new.deleted_at is not null then
    return new;
  end if;

  if not v_reissue then
    select stage into v_stage from public.estimates where id = new.estimate_id;
    if v_stage = 'lost' then
      raise exception 'This estimate is marked Lost — move it back to an open stage before invoicing it.'
        using errcode = 'P0001';
    end if;
    perform public._estimate_approval_guard(new.estimate_id, 'invoiced');
  end if;

  if exists (select 1 from public.crm_jobs j
              where j.estimate_id = new.estimate_id
                and j.deleted_at is null
                and j.job_type is distinct from 'project'
                and j.status is distinct from 'cancelled') then
    raise exception 'This estimate has already been converted to a job — invoice from the job instead.'
      using errcode = 'P0001';
  end if;

  select i.invoice_number::text into v_number
    from public.crm_jobs j
    join public.crm_job_visits v on v.job_id = j.id
    join public.crm_invoice_line_items li on li.visit_id = v.id
    join public.crm_invoices i on i.id = li.invoice_id
   where j.estimate_id = new.estimate_id
     and j.deleted_at is null
     and j.job_type is distinct from 'project'
     and i.deleted_at is null
     and i.status <> 'void'
   order by i.created_at
   limit 1;
  if found then
    raise exception 'A job from this estimate was cancelled after some of its visits were billed (%). Invoicing the whole estimate would bill that work twice — bill the rest from the job or add lines to that invoice.',
      coalesce('invoice #' || v_number, 'a draft invoice')
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

drop trigger if exists zy_crm_invoices_estimate_guard on public.crm_invoices;
create trigger zy_crm_invoices_estimate_guard
  before insert on public.crm_invoices
  for each row execute function public.guard_estimate_invoice_insert();
