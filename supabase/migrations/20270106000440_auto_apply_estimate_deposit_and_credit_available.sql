-- Bug sweep round 14 (4xx): deposits and credit on issued invoices (owner decision).
--
-- A proposal deposit is reserved for its estimate (crm_payments.estimate_id)
-- but was only used at card / ACH charge time (apply-credit-first.ts) or by
-- hand. A job invoice the deposit fully covered still showed the full balance
-- due, entered the invoice_past_due automation, and a client paying by check
-- paid twice.
--
-- 1. Auto-apply the estimate's own deposit when an invoice is issued (leaves
--    draft). _apply_reserved_deposits_to_invoice allocates every reserved,
--    unspent, undisputed deposit whose estimate owns the invoice
--    (estimate_owns_invoice, the same rule guard_reserved_deposit_allocation
--    enforces), oldest first, up to the balance. Each allocation raises
--    amount_paid_cents by exactly its amount and lowers the payment's
--    unused_amount_cents by the same, so allocations keep summing to
--    amount_paid (the refund allocation invariant). Skipped while a charge is
--    in flight (pending_payment_intent_id) or a dispute is open.
--    It runs from an AFTER UPDATE OF status trigger, so every issue path (Save,
--    Print, Email, bulk send, service role) is covered without per-route code,
--    and without the issuing user needing payment permissions.
-- 2. crm_invoice_credit_available(ids): other unapplied credit the client
--    holds (own + parent account, plus reserved deposits owned by the
--    invoice). Shown as "Credit available" on the invoice, PDF, pay page and
--    portal; `covered` (oldest-due first, so one credit can't cover several
--    invoices) keeps fully covered invoices out of past-due reminders.
--
-- PROD: apply BEFORE the code deploys (new code calls
-- crm_invoice_credit_available). Pre-check — invoices already issued that a
-- reserved deposit could pay (they are NOT changed by this migration; staff
-- can apply them with Apply Credit):
--   select i.id, i.invoice_number, i.balance_cents, p.id payment_id, p.unused_amount_cents
--     from crm_invoices i join crm_payments p on p.org_id = i.org_id and p.estimate_id is not null
--      and p.deleted_at is null and p.unused_amount_cents > 0
--    where i.deleted_at is null and i.status not in ('draft','void','paid') and i.balance_cents > 0
--      and public.estimate_owns_invoice(p.estimate_id, i.id);

create or replace function public._apply_reserved_deposits_to_invoice(p_invoice_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inv     record;
  v_pay     record;
  v_balance integer;
  v_apply   integer;
  v_applied integer := 0;
  v_paid    integer;
  v_status  text;
  v_payers  uuid[] := '{}';
begin
  select i.id, i.org_id, i.client_id, i.status, i.deleted_at, i.invoice_number,
         coalesce(i.total_cents, 0) as total_cents, coalesce(i.amount_paid_cents, 0) as amount_paid_cents,
         i.pending_payment_intent_id, i.open_dispute_payment_id
    into v_inv
    from public.crm_invoices i
   where i.id = p_invoice_id
   for update;
  if not found or v_inv.deleted_at is not null or v_inv.status in ('draft', 'void')
     or v_inv.pending_payment_intent_id is not null or v_inv.open_dispute_payment_id is not null then
    return 0;
  end if;

  v_balance := greatest(0, v_inv.total_cents - v_inv.amount_paid_cents);
  if v_balance <= 0 then
    return 0;
  end if;

  for v_pay in
    select p.id, p.client_id, coalesce(p.unused_amount_cents, 0) as unused
      from public.crm_payments p
     where p.org_id = v_inv.org_id
       and p.estimate_id is not null
       and p.deleted_at is null
       and coalesce(p.unused_amount_cents, 0) > 0
       and (p.disputed_at is null or p.dispute_status = 'won')
       and (p.client_id = v_inv.client_id
            or exists (select 1 from public.clients c
                        where c.id = v_inv.client_id and c.parent_client_id = p.client_id))
       and public.estimate_owns_invoice(p.estimate_id, v_inv.id)
     order by p.payment_date, p.created_at, p.id
     for update of p
  loop
    exit when v_balance <= 0;
    v_apply := least(v_pay.unused, v_balance);
    insert into public.crm_payment_allocations (org_id, payment_id, invoice_id, amount_cents)
    values (v_inv.org_id, v_pay.id, v_inv.id, v_apply);
    update public.crm_payments
       set unused_amount_cents = coalesce(unused_amount_cents, 0) - v_apply
     where id = v_pay.id;
    v_balance := v_balance - v_apply;
    v_applied := v_applied + v_apply;
    if not v_pay.client_id = any(v_payers) then
      v_payers := v_payers || v_pay.client_id;
    end if;
  end loop;

  if v_applied = 0 then
    return 0;
  end if;

  -- apply_payment_to_invoice's arithmetic (it requires the caller to hold a
  -- payment permission, which the person issuing the invoice may not).
  v_paid := v_inv.amount_paid_cents + v_applied;
  v_balance := greatest(0, v_inv.total_cents - v_paid);
  v_status := case when v_balance <= 0 then 'paid' when v_paid > 0 then 'partial' else v_inv.status end;
  update public.crm_invoices
     set amount_paid_cents = v_paid,
         balance_cents = v_balance,
         status = v_status
   where id = v_inv.id;
  if v_inv.invoice_number is null then
    perform public.assign_invoice_number(v_inv.id);
  end if;

  perform public.sync_client_balance(v_inv.client_id);
  for i in 1 .. coalesce(array_length(v_payers, 1), 0) loop
    if v_payers[i] is distinct from v_inv.client_id then
      perform public.sync_client_balance(v_payers[i]);
    end if;
  end loop;

  return v_applied;
end;
$function$;

revoke all on function public._apply_reserved_deposits_to_invoice(uuid) from public, anon, authenticated;
grant execute on function public._apply_reserved_deposits_to_invoice(uuid) to service_role;

create or replace function public.trg_apply_reserved_deposits_on_issue()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public._apply_reserved_deposits_to_invoice(new.id);
  return null;
end;
$function$;

drop trigger if exists trg_crm_invoices_apply_reserved_deposits on public.crm_invoices;
create trigger trg_crm_invoices_apply_reserved_deposits
  after update of status on public.crm_invoices
  for each row
  when (old.status = 'draft' and new.status not in ('draft', 'void') and new.deleted_at is null)
  execute function public.trg_apply_reserved_deposits_on_issue();

-- ── Credit available ─────────────────────────────────────────────────────────
create or replace function public.crm_invoice_credit_available(p_invoice_ids uuid[])
returns table(invoice_id uuid, credit_available_cents integer, covered boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_inv      record;
  v_client   uuid := null;
  v_general  integer := 0;
  v_pool     integer := 0;
  v_reserved integer;
  v_need     integer;
begin
  for v_inv in
    select i.id, i.org_id, i.client_id, i.status,
           greatest(0, coalesce(i.total_cents, 0) - coalesce(i.amount_paid_cents, 0)) as balance,
           c.parent_client_id
      from public.crm_invoices i
      left join public.clients c on c.id = i.client_id
     where i.id = any(coalesce(p_invoice_ids, '{}'::uuid[]))
       and i.deleted_at is null
       and i.status <> 'void'
       and not public._org_mismatch(i.org_id)
     order by i.client_id, coalesce(i.due_date, i.invoice_date), i.invoice_number nulls last, i.id
  loop
    if v_client is distinct from v_inv.client_id then
      v_client := v_inv.client_id;
      select coalesce(sum(p.unused_amount_cents), 0)::integer into v_general
        from public.crm_payments p
       where p.org_id = v_inv.org_id
         and p.estimate_id is null
         and p.deleted_at is null
         and coalesce(p.unused_amount_cents, 0) > 0
         and (p.disputed_at is null or p.dispute_status = 'won')
         and (p.client_id = v_inv.client_id or p.client_id = v_inv.parent_client_id);
      v_pool := v_general;
    end if;

    select coalesce(sum(p.unused_amount_cents), 0)::integer into v_reserved
      from public.crm_payments p
     where p.org_id = v_inv.org_id
       and p.estimate_id is not null
       and p.deleted_at is null
       and coalesce(p.unused_amount_cents, 0) > 0
       and (p.disputed_at is null or p.dispute_status = 'won')
       and (p.client_id = v_inv.client_id or p.client_id = v_inv.parent_client_id)
       and public.estimate_owns_invoice(p.estimate_id, v_inv.id);

    invoice_id := v_inv.id;
    credit_available_cents := v_general + v_reserved;
    v_need := greatest(0, v_inv.balance - v_reserved);
    if v_inv.status = 'draft' or v_inv.balance <= 0 then
      covered := false;
    elsif v_need <= v_pool then
      covered := true;
      v_pool := v_pool - v_need;
    else
      covered := false;
    end if;
    return next;
  end loop;
end;
$function$;

revoke all on function public.crm_invoice_credit_available(uuid[]) from public, anon;
grant execute on function public.crm_invoice_credit_available(uuid[]) to authenticated, service_role;
