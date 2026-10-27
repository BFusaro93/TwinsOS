-- Other-charge lines (fees) are deliberately not tied to a service. The
-- before-insert resolver was guessing one (e.g. the invoice job's only
-- service), which misfiled the fee's revenue and commission under it.
create or replace function public.fn_invoice_line_resolve_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.service_id is null and not coalesce(NEW.is_other_charge, false) then
    NEW.service_id := public.crm_resolve_invoice_line_service(
      NEW.org_id, NEW.invoice_id, NEW.visit_id, coalesce(NEW.name, NEW.description));
  end if;
  return NEW;
end;
$$;

-- Clear any service the old resolver assigned to existing other-charge lines.
update public.crm_invoice_line_items set service_id = null
 where is_other_charge and service_id is not null;
