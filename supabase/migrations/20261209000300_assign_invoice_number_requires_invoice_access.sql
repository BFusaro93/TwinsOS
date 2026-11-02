-- assign_invoice_number is SECURITY DEFINER, so the crm_invoices write guard
-- (20261207000200) never sees its update. It only gives a numberless invoice
-- the org's next number, and every staff path that can reach a numberless
-- invoice calls it: Print/PDF (anyone who can view the invoice), the email
-- route (acct_send_invoices), Save, the contract and snow generators. It
-- therefore stays open to anyone who can READ the invoice, not to a single
-- key — but until now that was only "same org", which also let crew and
-- non-CRM logins (who cannot read crm_invoices) burn numbers. The check now
-- mirrors the crm_invoices_select policy: same org, not crew, has_crm_access.
-- Service role, cron and trigger callers (auth.uid() null or depth > 0) are
-- unchanged.
--
-- Body is 20261203000100 (the live definition on TEST) plus the two
-- conditions in the guard.
create or replace function public.assign_invoice_number(p_invoice_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_num integer;
  v_org uuid;
  v_per_org boolean;
begin
  select invoice_number, org_id into v_num, v_org from crm_invoices where id = p_invoice_id for update;
  if auth.uid() is not null and pg_trigger_depth() = 0
     and (v_org is null or v_org is distinct from public.my_org_id()
          or public.my_role() is not distinct from 'crew'
          or not public.has_crm_access()) then
    raise exception 'invoice not found' using errcode = '42501';
  end if;
  -- Only assign if not already set
  if v_num is not null then
    return v_num;
  end if;
  select coalesce(per_org_numbering, false) into v_per_org from organizations where id = v_org;
  loop
    if v_per_org then
      v_num := public.next_org_number(v_org, 'crm_invoice');
    else
      v_num := nextval('crm_invoices_number_seq');
    end if;
    exit when not exists (
      select 1 from crm_invoices
       where org_id = v_org and invoice_number = v_num and deleted_at is null
    );
  end loop;
  update crm_invoices set invoice_number = v_num where id = p_invoice_id;
  return v_num;
end;
$function$;
