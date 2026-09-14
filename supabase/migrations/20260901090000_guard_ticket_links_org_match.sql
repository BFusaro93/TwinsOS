-- crm_ticket_links.linked_id is a polymorphic reference (by link_type) to
-- estimates/crm_invoices/crm_jobs/projects, with no FK (can't have one on a
-- polymorphic column) and no trigger checking the target belongs to the
-- same org as the ticket link row — RLS on crm_ticket_links itself only
-- checks the link row's own org_id, not the referenced record's. A
-- guessed/leaked estimate, invoice, job, or project id from another org
-- could be persisted as a cross-tenant link with no error. Same fix as
-- guard_damage_case_po_org_match() in 20260829100000_fix_damage_case_bugs.sql.
create or replace function public.guard_ticket_link_org_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if new.link_type = 'estimate' then
    select exists(select 1 from public.estimates where id = new.linked_id and org_id = new.org_id) into v_ok;
  elsif new.link_type = 'invoice' then
    select exists(select 1 from public.crm_invoices where id = new.linked_id and org_id = new.org_id) into v_ok;
  elsif new.link_type = 'job' then
    select exists(select 1 from public.crm_jobs where id = new.linked_id and org_id = new.org_id) into v_ok;
  elsif new.link_type = 'project' then
    select exists(select 1 from public.projects where id = new.linked_id and org_id = new.org_id) into v_ok;
  else
    v_ok := false;
  end if;

  if not v_ok then
    raise exception 'linked_id must belong to the same org as this ticket link';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_ticket_link_org_match on public.crm_ticket_links;
create trigger trg_guard_ticket_link_org_match
  before insert or update on public.crm_ticket_links
  for each row execute function public.guard_ticket_link_org_match();
