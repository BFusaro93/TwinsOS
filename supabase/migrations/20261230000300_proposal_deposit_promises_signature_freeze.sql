-- Proposals & deposits (bug sweep round 10)
--
-- 1. Client-declared deposits ("I'll pay by check") get their own columns.
--    The proposal accept route used to write a self-reported promise into
--    deposit_collected_*, so the estimate showed a green "Collected" badge for
--    money nobody had received, the duplicate-charge guard read it as a real
--    deposit, and it could overwrite a real Stripe-stamped deposit_reference.
--    Promises now live in deposit_promised_*; deposit_collected_* is written
--    only by the Stripe webhook (record-estimate-deposit.ts).
--
-- 2. Signature evidence on estimate_share_tokens is frozen once accepted:
--    accepted_at / accepted_by_name / signature_data / ip_address /
--    accepted_version_number / accepted_user_agent can't change afterwards.
--    The one exception is the accept route's own rollback (service role,
--    clearing ALL of them together in one write) when a later step of the
--    same acceptance fails. Every change is written to audit_log.
--
-- 3. A proposal deposit is reserved for its estimate: crm_payments.estimate_id
--    tags the prepayment, and an allocation of a tagged payment is only
--    allowed onto an invoice of that estimate (or its job / project /
--    contract). crm_release_estimate_deposit() releases it to general credit.

-- ── 1. Promised deposits ──────────────────────────────────────────────────
alter table public.estimates
  add column if not exists deposit_promised_cents integer,
  add column if not exists deposit_promised_method text,
  add column if not exists deposit_promised_reference text,
  add column if not exists deposit_promised_notes text,
  add column if not exists deposit_promised_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'estimates_deposit_promised_cents_check') then
    alter table public.estimates
      add constraint estimates_deposit_promised_cents_check
      check (deposit_promised_cents is null or deposit_promised_cents > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'estimates_deposit_promised_method_check') then
    alter table public.estimates
      add constraint estimates_deposit_promised_method_check
      check (deposit_promised_method is null
             or deposit_promised_method = any (array['cash','check','ach','credit_card','other']));
  end if;
end $$;

comment on column public.estimates.deposit_promised_cents is
  'Deposit the CLIENT said (on the proposal page) they will send by cash/check/etc. A promise, not money: never counted as collected.';

-- ── 3a. Reserved deposits: crm_payments.estimate_id ────────────────────────
alter table public.crm_payments
  add column if not exists estimate_id uuid references public.estimates(id);
create index if not exists crm_payments_estimate_id_idx
  on public.crm_payments (estimate_id) where estimate_id is not null;
comment on column public.crm_payments.estimate_id is
  'Set on a proposal deposit: the credit is reserved for invoices of this estimate (its job/project/contract) until staff release it (crm_release_estimate_deposit).';

-- ── Backfill (one-off, idempotent) ─────────────────────────────────────────
-- a) Tag deposit prepayments with their estimate where the link is
--    unambiguous: the estimate's deposit_reference IS the payment's intent id,
--    or (when a client claim overwrote deposit_reference) the webhook memo
--    "Deposit for estimate #N paid online" names exactly one estimate of that
--    org + client.
update public.crm_payments p
   set estimate_id = e.id
  from public.estimates e
 where p.estimate_id is null
   and p.stripe_payment_intent_id is not null
   and e.org_id = p.org_id
   and e.deposit_reference = p.stripe_payment_intent_id;

update public.crm_payments p
   set estimate_id = m.estimate_id
  from (
    select p2.id as payment_id, min(e.id::text)::uuid as estimate_id
      from public.crm_payments p2
      join public.estimates e
        on e.org_id = p2.org_id
       and e.client_id = p2.client_id
       and e.deleted_at is null
       and p2.memo = 'Deposit for estimate #' || e.estimate_number || ' paid online'
     where p2.estimate_id is null
       and p2.is_prepayment
       and p2.stripe_payment_intent_id is not null
     group by p2.id
    having count(*) = 1
  ) m
 where p.id = m.payment_id;

-- b) Move client claims out of deposit_collected_*: a collected deposit with
--    no crm_payments row behind its reference is a claim. When a Stripe
--    deposit for the same estimate exists (the claim overwrote it), restore
--    the collected stamp from that payment.
do $$
declare
  v_moved integer;
  v_restored integer;
begin
  create temp table _claimed on commit drop as
  select e.id, e.org_id, e.deposit_collected_cents, e.deposit_collected_at,
         e.deposit_method, e.deposit_reference, e.deposit_notes
    from public.estimates e
   where coalesce(e.deposit_collected_cents, 0) > 0
     and not exists (
       select 1 from public.crm_payments p
        where p.org_id = e.org_id
          and p.stripe_payment_intent_id is not null
          and p.stripe_payment_intent_id = e.deposit_reference
     );

  update public.estimates e
     set deposit_promised_cents     = c.deposit_collected_cents,
         deposit_promised_method    = case when c.deposit_method = any (array['cash','check','ach','credit_card','other'])
                                           then c.deposit_method else 'other' end,
         deposit_promised_reference = c.deposit_reference,
         deposit_promised_notes     = c.deposit_notes,
         deposit_promised_at        = c.deposit_collected_at,
         deposit_collected_cents    = 0,
         deposit_collected_at       = null,
         deposit_method             = null,
         deposit_reference          = null,
         deposit_notes              = null
    from _claimed c
   where e.id = c.id;
  get diagnostics v_moved = row_count;

  update public.estimates e
     set deposit_collected_cents = greatest(p.amount_cents - coalesce(p.refunded_amount_cents, 0), 0),
         deposit_collected_at    = case when p.amount_cents - coalesce(p.refunded_amount_cents, 0) > 0 then p.created_at end,
         deposit_method          = case when p.method ilike '%ach%' or p.method ilike '%bank%' then 'ach' else 'credit_card' end,
         deposit_reference       = p.stripe_payment_intent_id
    from _claimed c
    join lateral (
      select * from public.crm_payments p
       where p.estimate_id = c.id and p.deleted_at is null and p.stripe_payment_intent_id is not null
       order by p.created_at desc limit 1
    ) p on true
   where e.id = c.id;
  get diagnostics v_restored = row_count;

  raise notice 'deposit backfill: % client claims moved to deposit_promised_*, % real deposits restored', v_moved, v_restored;
end $$;

-- ── 3b. Invoice ↔ estimate ownership ───────────────────────────────────────
-- An invoice belongs to an estimate when it is billed from the estimate
-- itself, from a job converted from it, from a project one of those jobs (or
-- the estimate's milestones) belong to, from a contract made from it, or when
-- any of its lines is a visit of such a job.
create or replace function public.estimate_owns_invoice(p_estimate_id uuid, p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.crm_invoices i
      join public.estimates e on e.id = p_estimate_id and e.org_id = i.org_id
     where i.id = p_invoice_id
       and (
         i.estimate_id = e.id
         or i.crm_job_id in (select j.id from public.crm_jobs j where j.estimate_id = e.id)
         or i.contract_id in (select c.id from public.crm_contracts c where c.estimate_id = e.id)
         or i.project_id in (
              select j.project_id from public.crm_jobs j where j.estimate_id = e.id and j.project_id is not null
              union
              select m.project_id from public.estimate_milestones m where m.estimate_id = e.id and m.project_id is not null
            )
         or exists (
              select 1
                from public.crm_invoice_line_items li
                join public.crm_job_visits v on v.id = li.visit_id
                join public.crm_jobs j on j.id = v.job_id
               where li.invoice_id = i.id
                 and j.estimate_id = e.id
            )
       )
  );
$$;
revoke all on function public.estimate_owns_invoice(uuid, uuid) from public, anon;
grant execute on function public.estimate_owns_invoice(uuid, uuid) to authenticated, service_role;

-- Every allocation path (crm_apply_credit_to_invoice, crm_update_payment,
-- dispute reinstatement, …) inserts into crm_payment_allocations, so the
-- reservation is enforced here once rather than in each RPC.
create or replace function public.guard_reserved_deposit_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimate_id uuid;
  v_estimate_number integer;
begin
  select p.estimate_id into v_estimate_id
    from public.crm_payments p
   where p.id = new.payment_id;
  if v_estimate_id is null then
    return new;
  end if;
  if public.estimate_owns_invoice(v_estimate_id, new.invoice_id) then
    return new;
  end if;
  select estimate_number into v_estimate_number from public.estimates where id = v_estimate_id;
  raise exception 'This deposit is reserved for Estimate #% and can only be applied to its invoices. Release it to general credit on the estimate first.',
    coalesce(v_estimate_number::text, '?')
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_guard_reserved_deposit_allocation on public.crm_payment_allocations;
create trigger trg_guard_reserved_deposit_allocation
  before insert or update of payment_id, invoice_id on public.crm_payment_allocations
  for each row execute function public.guard_reserved_deposit_allocation();

-- ── 3c. Release a reserved deposit to general credit ───────────────────────
create or replace function public.crm_release_estimate_deposit(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_est uuid;
begin
  if not public._acct_permitted(array['acct_add_modify_payments','acct_add_modify_credits']) then
    raise exception 'You do not have permission to release a deposit' using errcode = '42501';
  end if;
  select org_id, estimate_id into v_org, v_est
    from public.crm_payments
   where id = p_payment_id and deleted_at is null
   for update;
  if not found or public._org_mismatch(v_org) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if v_est is null then
    return;
  end if;
  update public.crm_payments set estimate_id = null where id = p_payment_id;
end;
$$;
revoke all on function public.crm_release_estimate_deposit(uuid) from public, anon;
grant execute on function public.crm_release_estimate_deposit(uuid) to authenticated, service_role;

-- ── 2. Freeze signature evidence on share tokens ──────────────────────────
alter table public.estimate_share_tokens
  add column if not exists accepted_version_number integer,
  add column if not exists accepted_user_agent text;

create or replace function public.guard_share_token_acceptance_frozen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.accepted_at is null then
    return new;
  end if;
  if new.accepted_at              is not distinct from old.accepted_at
     and new.accepted_by_name     is not distinct from old.accepted_by_name
     and new.signature_data       is not distinct from old.signature_data
     and new.ip_address           is not distinct from old.ip_address
     and new.accepted_version_number is not distinct from old.accepted_version_number
     and new.accepted_user_agent  is not distinct from old.accepted_user_agent then
    return new;
  end if;
  -- The accept route's rollback (a later step of the SAME acceptance failed):
  -- service role only, and only as one write clearing the whole record.
  if coalesce(auth.role(), '') = 'service_role'
     and new.accepted_at is null
     and new.accepted_by_name is null
     and new.signature_data is null
     and new.ip_address is null
     and new.accepted_version_number is null
     and new.accepted_user_agent is null then
    return new;
  end if;
  raise exception 'A signed proposal acceptance can''t be changed'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_share_token_acceptance_frozen on public.estimate_share_tokens;
create trigger trg_share_token_acceptance_frozen
  before update on public.estimate_share_tokens
  for each row execute function public.guard_share_token_acceptance_frozen();

-- Audit trail, rolled up onto the estimate (same audit_log shape fn_audit_log
-- writes). View counters are deliberately not logged.
create or replace function public.fn_audit_share_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid;
  v_user_name text;
  v_rows      jsonb := '[]'::jsonb;
  v_row       jsonb;
begin
  if coalesce(current_setting('app.suppress_audit', true), '') = 'true' then
    return coalesce(new, old);
  end if;

  begin
    select id, coalesce(name, email, id::text) into v_user_id, v_user_name
      from public.profiles where id = auth.uid();
  exception when others then
    v_user_id := null; v_user_name := null;
  end;

  if tg_op = 'INSERT' then
    v_rows := v_rows || jsonb_build_object('action', 'created', 'desc', 'Proposal link created',
      'old', null, 'new', new.expires_at::text);
  elsif tg_op = 'UPDATE' then
    if old.accepted_at is null and new.accepted_at is not null then
      v_rows := v_rows || jsonb_build_object('action', 'status_changed',
        'desc', format('Proposal accepted online by %s%s%s',
                       coalesce(new.accepted_by_name, '—'),
                       case when new.accepted_version_number is not null then format(' (version %s)', new.accepted_version_number) else '' end,
                       case when new.ip_address is not null then format(' from %s', new.ip_address) else '' end),
        'old', null, 'new', new.accepted_at::text);
      v_user_name := coalesce(v_user_name, new.accepted_by_name);
    elsif old.accepted_at is not null and new.accepted_at is null then
      v_rows := v_rows || jsonb_build_object('action', 'status_changed',
        'desc', 'Online acceptance rolled back (the acceptance could not be completed)',
        'old', old.accepted_at::text, 'new', null);
    elsif old.accepted_at is not null and (
            new.accepted_by_name is distinct from old.accepted_by_name
         or new.signature_data is distinct from old.signature_data
         or new.ip_address is distinct from old.ip_address
         or new.accepted_at is distinct from old.accepted_at) then
      v_rows := v_rows || jsonb_build_object('action', 'updated',
        'desc', 'Signed acceptance record changed', 'old', old.accepted_by_name, 'new', new.accepted_by_name);
    end if;
    if new.expires_at is distinct from old.expires_at then
      v_rows := v_rows || jsonb_build_object('action', 'updated', 'desc', 'Proposal link expiry changed',
        'old', old.expires_at::text, 'new', new.expires_at::text);
    end if;
    if old.deleted_at is null and new.deleted_at is not null then
      v_rows := v_rows || jsonb_build_object('action', 'deleted', 'desc', 'Proposal link retired',
        'old', null, 'new', null);
    end if;
  end if;

  for v_row in select * from jsonb_array_elements(v_rows) loop
    insert into public.audit_log (
      org_id, created_by, record_type, record_id, action,
      changed_by_name, description, old_value, new_value
    ) values (
      coalesce(new.org_id, old.org_id), v_user_id, 'estimate', coalesce(new.estimate_id, old.estimate_id),
      v_row ->> 'action', coalesce(v_user_name, 'system'), v_row ->> 'desc',
      v_row ->> 'old', v_row ->> 'new'
    );
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_estimate_share_tokens_audit on public.estimate_share_tokens;
create trigger trg_estimate_share_tokens_audit
  after insert or update on public.estimate_share_tokens
  for each row execute function public.fn_audit_share_token();
