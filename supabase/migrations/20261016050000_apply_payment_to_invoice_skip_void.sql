-- apply_payment_to_invoice recomputed status from paid/balance with no regard
-- for the current status, so a payment (or a reversal) landing on a VOID
-- invoice flipped it to sent/partial/paid and silently un-voided it.
-- Early-return for void invoices: leave the row untouched.
-- Body is otherwise identical to 20260928100000 (null-org guard re-stated).

CREATE OR REPLACE FUNCTION public.apply_payment_to_invoice(p_invoice_id uuid, p_delta_cents integer)
 RETURNS TABLE(new_status text, was_newly_paid boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  -- A void invoice stays void: don't recompute its status or balance.
  if v_old_status = 'void' then
    return query select v_old_status, false;
    return;
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

  if v_number is null then
    perform public.assign_invoice_number(p_invoice_id);
  end if;

  return query select v_new_status, (v_new_status = 'paid' and v_old_status is distinct from 'paid');
end;
$function$;
