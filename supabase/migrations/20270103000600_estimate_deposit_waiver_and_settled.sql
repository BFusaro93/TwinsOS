-- Bug sweep round 13 (6xx): when is a proposal deposit no longer due?
--
-- A required deposit the client skipped at acceptance stays "due" on the
-- proposal page, the portal and the deposit-intent route. Until now it stayed
-- due for ever — even once the job had been invoiced and paid in full, so a
-- client could be asked for (and pay) a "deposit" on work they had already
-- paid for. Two ways out are added:
--
--  1. Settled by invoices: once the estimate's own invoices (the same
--     ownership rule as the reserved-deposit guard, estimate_owns_invoice)
--     include at least one issued invoice and none of them has a balance
--     left, the deposit is moot. estimate_deposit_invoices_settled() answers
--     that for a batch of estimates.
--  2. Waived by staff: deposit_waived_at / _by / _reason, written only by
--     crm_set_estimate_deposit_waiver() so "who waived it" can't be forged by
--     a direct PostgREST update.
--
-- Additive only. PROD: apply BEFORE the code deploys (the new code selects the
-- waiver columns and calls both functions; old code ignores them).

alter table public.estimates
  add column if not exists deposit_waived_at timestamptz,
  add column if not exists deposit_waived_by uuid references auth.users(id) on delete set null,
  add column if not exists deposit_waived_reason text;

comment on column public.estimates.deposit_waived_at is
  'Staff waived the unpaid required deposit (crm_set_estimate_deposit_waiver). A waived deposit is never shown as due or payable.';

-- ── 1. Settled by invoices ────────────────────────────────────────────────────
-- Returns the ids (of those passed) whose deposit is settled by invoices:
-- at least one owned, issued (not draft, not void, not deleted) invoice, and no
-- owned issued invoice with an open balance. Drafts are ignored — they haven't
-- been billed yet. Candidates are read through the client index and then
-- confirmed with estimate_owns_invoice, so ownership has one definition.
create or replace function public.estimate_deposit_invoices_settled(p_estimate_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  with est as (
    select e.id, e.org_id, e.client_id
      from public.estimates e
     where e.id = any(coalesce(p_estimate_ids, '{}'::uuid[]))
       and not public._org_mismatch(e.org_id)
  ),
  owned as (
    select est.id as estimate_id, i.balance_cents
      from est
      join public.crm_invoices i
        on i.org_id = est.org_id
       and i.client_id = est.client_id
       and i.deleted_at is null
       and i.status not in ('draft', 'void')
     where public.estimate_owns_invoice(est.id, i.id)
  )
  select o.estimate_id
    from owned o
   group by o.estimate_id
  having bool_and(coalesce(o.balance_cents, 0) <= 0);
$function$;

revoke all on function public.estimate_deposit_invoices_settled(uuid[]) from public, anon;
grant execute on function public.estimate_deposit_invoices_settled(uuid[]) to authenticated, service_role;

-- ── 2. Staff waiver ───────────────────────────────────────────────────────────
create or replace function public.crm_set_estimate_deposit_waiver(
  p_estimate_id uuid,
  p_waived boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_est public.estimates%rowtype;
  v_accepted boolean;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not public._acct_permitted(array['estimate_edit', 'acct_add_modify_payments']) then
    raise exception 'You do not have permission to waive a deposit' using errcode = '42501';
  end if;

  select * into v_est
    from public.estimates
   where id = p_estimate_id and deleted_at is null
   for update;
  if not found or public._org_mismatch(v_est.org_id) then
    raise exception 'Estimate not found' using errcode = 'P0002';
  end if;

  if not coalesce(p_waived, false) then
    update public.estimates
       set deposit_waived_at = null, deposit_waived_by = null, deposit_waived_reason = null
     where id = p_estimate_id;
    return;
  end if;

  -- Same "accepted by any route" test the proposal page and deposit-intent use.
  v_accepted := v_est.portal_accepted_at is not null
    or v_est.stage in ('accepted', 'won', 'invoiced')
    or exists (
      select 1 from public.estimate_share_tokens t
       where t.estimate_id = v_est.id and t.org_id = v_est.org_id and t.accepted_at is not null
    );
  if not v_accepted then
    raise exception 'Only an accepted estimate''s deposit can be waived. Before acceptance, change Deposit Required instead.'
      using errcode = 'check_violation';
  end if;
  if coalesce(v_est.deposit_required_cents, 0) <= 0 then
    raise exception 'This estimate has no deposit to waive' using errcode = 'check_violation';
  end if;
  if coalesce(v_est.deposit_collected_cents, 0) > 0 then
    raise exception 'A deposit has already been collected on this estimate' using errcode = 'check_violation';
  end if;
  if coalesce(v_est.deposit_pending_cents, 0) > 0 then
    raise exception 'A deposit payment is still processing — wait for it to settle or fail first'
      using errcode = 'check_violation';
  end if;

  update public.estimates
     set deposit_waived_at = coalesce(v_est.deposit_waived_at, now()),
         deposit_waived_by = case when v_est.deposit_waived_at is null then auth.uid() else v_est.deposit_waived_by end,
         deposit_waived_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_estimate_id;
end;
$function$;

revoke all on function public.crm_set_estimate_deposit_waiver(uuid, boolean, text) from public, anon;
grant execute on function public.crm_set_estimate_deposit_waiver(uuid, boolean, text) to authenticated, service_role;

-- Direct (PostgREST) writes may not set or change the waiver: only the RPC
-- above records who waived it. Service role, SECURITY DEFINER functions and
-- trigger cascades are not direct user writes (_crm_direct_user_write).
create or replace function public.guard_estimate_deposit_waiver()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if not public._crm_direct_user_write() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- A copied estimate (Duplicate) never inherits a waiver.
    new.deposit_waived_at := null;
    new.deposit_waived_by := null;
    new.deposit_waived_reason := null;
    return new;
  end if;
  if new.deposit_waived_at is distinct from old.deposit_waived_at
     or new.deposit_waived_by is distinct from old.deposit_waived_by
     or new.deposit_waived_reason is distinct from old.deposit_waived_reason then
    raise exception 'Use Waive deposit on the estimate to change a deposit waiver'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_estimate_deposit_waiver on public.estimates;
create trigger trg_guard_estimate_deposit_waiver
  before insert or update on public.estimates
  for each row execute function public.guard_estimate_deposit_waiver();
