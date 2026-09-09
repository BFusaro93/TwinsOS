-- An invoice could reach `paid` while its invoice_number was still null.
--
-- A number is assigned by assign_invoice_number(), and the only thing that
-- called it for a hand-built invoice was the explicit Save on a draft (and the
-- To Email / To Print queues). But a draft can be taken straight to paid
-- without ever passing through those: Collect Payment, Enter Payment, an
-- autopay charge, the client portal, or the Connect webhook all apply money to
-- whatever invoice they're pointed at. apply_payment_to_invoice() moves the
-- status out of draft — that's the point of v_open_status — but never asked for
-- a number.
--
-- Confirmed live 2026-09-09: paying Diane Okafor's $45 draft by card left the
-- row status='paid', total=4500, amount_paid=4500, invoice_number=null. The
-- invoice list renders that as "—", so a customer-facing, fully-paid invoice
-- had no identifier to quote on a receipt, a statement, or a support call.
--
-- Numbering now happens wherever money first lands on an invoice, which is the
-- one funnel every payment path shares. assign_invoice_number() returns the
-- existing number untouched when one is already set, so this is a no-op for
-- every already-numbered invoice and for refunds (negative deltas) alike.

create or replace function public.apply_payment_to_invoice(
  p_invoice_id uuid,
  p_delta_cents integer
)
returns table(new_status text, was_newly_paid boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org_id      uuid;
  v_total_cents integer;
  v_old_paid    integer;
  v_old_status  text;
  v_new_paid    integer;
  v_new_balance integer;
  v_open_status text;
  v_new_status  text;
  v_number      integer;
begin
  select org_id, total_cents, amount_paid_cents, status, invoice_number
    into v_org_id, v_total_cents, v_old_paid, v_old_status, v_number
    from public.crm_invoices
    where id = p_invoice_id
    for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  v_new_paid := greatest(0, v_old_paid + p_delta_cents);
  v_new_balance := greatest(0, v_total_cents - v_new_paid);
  v_open_status := case when v_old_status = 'printed' then 'printed' else 'sent' end;
  v_new_status := case
    when v_new_balance <= 0 then 'paid'
    when v_new_paid > 0 then 'partial'
    else v_open_status
  end;

  update public.crm_invoices
  set amount_paid_cents = v_new_paid,
      balance_cents = v_new_balance,
      status = v_new_status
  where id = p_invoice_id;

  -- Money has landed on this invoice and it is no longer a draft, so it needs
  -- an identifier a customer can be given. Idempotent: assign_invoice_number()
  -- returns the existing number when one is already set.
  if v_number is null then
    perform public.assign_invoice_number(p_invoice_id);
  end if;

  return query select v_new_status, (v_new_status = 'paid' and v_old_status is distinct from 'paid');
end;
$function$;

notify pgrst, 'reload schema';
