-- A job's billed service fields are invoice-key-only once the job has been
-- invoiced.
--
-- crm_job_services.rate_cents / qty / is_taxable / included are what visit
-- auto-invoicing (complete-visit-side-effects) and the Job Detail auto-invoice
-- route bill. Any CRM seat could change them from a browser session, so
-- together with an open draft -> sent (closed in 20261213000501) a role with
-- no invoice keys could set the price of what the customer is billed. Once
-- the job has a live (not void, not deleted) invoice line — tagged through one
-- of its visits — changing those fields from an end-user session needs
-- acct_add_modify_invoices. Before the first invoice, Job Detail editing is
-- unchanged.
--
-- Exempt like every #406 guard (20261207000100): service role, SECURITY
-- DEFINER RPCs (price adjustment runs, convert), trigger cascades; admins pass.
create or replace function public.enforce_crm_job_service_billing_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public._crm_direct_user_write()
     or public.has_settings_permission('acct_add_modify_invoices') then
    return new;
  end if;

  if new.rate_cents is not distinct from old.rate_cents
     and new.qty is not distinct from old.qty
     and new.is_taxable is not distinct from old.is_taxable
     and new.included is not distinct from old.included
     and new.job_id is not distinct from old.job_id then
    return new;
  end if;

  if exists (
    select 1
    from public.crm_job_visits v
    join public.crm_invoice_line_items li on li.visit_id = v.id
    join public.crm_invoices i on i.id = li.invoice_id
    where v.job_id in (old.job_id, new.job_id)
      and i.status <> 'void'
      and i.deleted_at is null
  ) then
    raise exception 'This job has already been invoiced — only someone who can modify invoices can change its service rates, quantities or taxable flag'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists a_crm_job_services_enforce_billing_write on public.crm_job_services;
create trigger a_crm_job_services_enforce_billing_write
  before update on public.crm_job_services
  for each row
  execute function public.enforce_crm_job_service_billing_write();
