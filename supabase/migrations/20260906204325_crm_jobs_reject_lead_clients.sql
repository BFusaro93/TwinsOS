-- Jobs can only be created for clients — never for leads or lost leads.
--
-- The New Job dialogs used to list leads in the client picker (only inactive/
-- cancelled were filtered), so a lead could end up with scheduled visits and
-- invoices before it was ever converted. The UI now hides lead/lost accounts;
-- this trigger is the data-integrity guard behind it (API, Zapier, imports).
--
-- Only fires when the job's client_id is set/changed — reassigning other
-- columns on an existing job whose client later went to "lost" is untouched.

create or replace function public.crm_jobs_reject_lead_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_name   text;
begin
  if new.client_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.client_id is not distinct from old.client_id then
    return new;
  end if;

  select status, display_name into v_status, v_name
    from public.clients
   where id = new.client_id;

  if v_status in ('lead', 'lost') then
    raise exception 'Cannot create a job for % — the account is a % lead. Convert it to a client first.',
      coalesce(v_name, new.client_id::text),
      case when v_status = 'lost' then 'closed-lost' else 'prospective' end
      using errcode = 'check_violation', hint = 'Convert the lead to a client, then create the job.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_jobs_reject_lead_client on public.crm_jobs;
create trigger trg_crm_jobs_reject_lead_client
  before insert or update of client_id on public.crm_jobs
  for each row execute function public.crm_jobs_reject_lead_client();
