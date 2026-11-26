-- Record / edit a payment AND its custom method name ("Venmo", "Zelle"...) in ONE
-- transaction. The app used to call crm_record_payment / crm_update_payment and then
-- write crm_payments.method_label in a second request, so a failure between the two
-- left a recorded payment with no name (or, on edit, a cleared label). These wrappers
-- call the existing RPCs (SECURITY INVOKER, so every guard and RLS policy still
-- applies) and set the label inside the same transaction: any error rolls it all back.
--
-- Idempotent. Apply BEFORE OR WITH the code deploy.

create or replace function public.crm_record_payment_labeled(
  p_client_id uuid, p_amount_cents integer, p_payment_date date, p_method text,
  p_reference text, p_memo text, p_is_prepayment boolean, p_is_credit boolean,
  p_allocations jsonb, p_method_label text
) returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  v_result := public.crm_record_payment(
    p_client_id, p_amount_cents, p_payment_date, p_method, p_reference, p_memo,
    p_is_prepayment, p_is_credit, p_allocations);
  if nullif(btrim(coalesce(p_method_label, '')), '') is not null then
    update public.crm_payments
       set method_label = btrim(p_method_label)
     where id = (v_result ->> 'payment_id')::uuid;
    if not found then
      raise exception 'Payment recorded but could not be labelled' using errcode = 'P0002';
    end if;
  end if;
  return v_result;
end;
$function$;

create or replace function public.crm_update_payment_labeled(
  p_payment_id uuid, p_client_id uuid, p_amount_cents integer, p_payment_date date,
  p_method text, p_reference text, p_memo text, p_allocations jsonb, p_method_label text
) returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  -- The label CHECK only allows a label while method = 'Other', and crm_update_payment
  -- rewrites method without touching the label: clear a stale one first.
  update public.crm_payments set method_label = null where id = p_payment_id;
  v_result := public.crm_update_payment(
    p_payment_id, p_client_id, p_amount_cents, p_payment_date, p_method, p_reference,
    p_memo, p_allocations);
  if p_method = 'Other' and nullif(btrim(coalesce(p_method_label, '')), '') is not null then
    update public.crm_payments set method_label = btrim(p_method_label) where id = p_payment_id;
  end if;
  return v_result;
end;
$function$;

revoke execute on function public.crm_record_payment_labeled(uuid, integer, date, text, text, text, boolean, boolean, jsonb, text) from public, anon;
grant  execute on function public.crm_record_payment_labeled(uuid, integer, date, text, text, text, boolean, boolean, jsonb, text) to authenticated, service_role;
revoke execute on function public.crm_update_payment_labeled(uuid, uuid, integer, date, text, text, text, jsonb, text) from public, anon;
grant  execute on function public.crm_update_payment_labeled(uuid, uuid, integer, date, text, text, text, jsonb, text) to authenticated, service_role;
