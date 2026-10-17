-- assign_invoice_number must not hand out a number a live invoice in the same org
-- already holds.
--
-- crm_invoices_number_seq is global, but uniqueness is per org among live
-- invoices (crm_invoices_org_number_unique), and staff can hand-type any number in
-- the invoice header. Once the global sequence reached a number an org had typed
-- by hand, `UPDATE ... invoice_number = nextval(...)` violated the unique index —
-- and because apply_payment_to_invoice numbers unnumbered invoices, recording a
-- payment (crm_record_payment, crm_apply_credit_to_invoice, crm_update_payment)
-- aborted with a 23505 for that invoice. Draw from the sequence until the number
-- is free in this org; the skipped numbers are simply never used.

create or replace function public.assign_invoice_number(p_invoice_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_num integer;
  v_org uuid;
begin
  select invoice_number, org_id into v_num, v_org from crm_invoices where id = p_invoice_id for update;
  if auth.uid() is not null and pg_trigger_depth() = 0
     and (v_org is null or v_org is distinct from public.my_org_id()) then
    raise exception 'invoice not found' using errcode = '42501';
  end if;
  -- Only assign if not already set
  if v_num is not null then
    return v_num;
  end if;
  loop
    v_num := nextval('crm_invoices_number_seq');
    exit when not exists (
      select 1 from crm_invoices
       where org_id = v_org and invoice_number = v_num and deleted_at is null
    );
  end loop;
  update crm_invoices set invoice_number = v_num where id = p_invoice_id;
  return v_num;
end;
$function$;
