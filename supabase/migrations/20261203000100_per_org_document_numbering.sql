-- New organizations number their invoices, estimates and tickets from 1.
--
-- crm_invoices_number_seq, crm_ticket_number_seq and estimates.estimate_number's serial are
-- global, so a brand-new org's first invoice was #48213 and its first estimate #3142 (which
-- also leaks other tenants' volume). Existing orgs keep their numbers: only orgs flagged
-- per_org_numbering draw from a per-org counter; /api/orgs/create sets the flag for new orgs.
--
-- DEPLOY ORDER: apply BEFORE the code that inserts organizations.per_org_numbering.

alter table public.organizations
  add column if not exists per_org_numbering boolean not null default false;

create or replace function public.next_org_number(p_org_id uuid, p_entity_type text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  insert into public.entity_number_counters (org_id, entity_type, period, count)
  values (p_org_id, p_entity_type, 'all', 1)
  on conflict (org_id, entity_type, period)
    do update set count = public.entity_number_counters.count + 1
  returning count into v_count;
  return v_count;
end;
$function$;
revoke all on function public.next_org_number(uuid, text) from public, anon, authenticated;

-- Invoices: same as 20261023000000 (permission guard + skip numbers a live invoice already
-- holds in the org), drawing from the per-org counter for flagged orgs.
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
     and (v_org is null or v_org is distinct from public.my_org_id()) then
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

-- Tickets and estimates take their number from a column default; a BEFORE INSERT trigger
-- replaces it for flagged orgs.
create or replace function public.trg_per_org_ticket_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (select 1 from organizations where id = new.org_id and per_org_numbering) then
    new.ticket_number := public.next_org_number(new.org_id, 'crm_ticket');
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_per_org_ticket_number on public.crm_tickets;
create trigger trg_per_org_ticket_number
  before insert on public.crm_tickets
  for each row execute function public.trg_per_org_ticket_number();

create or replace function public.trg_per_org_estimate_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (select 1 from organizations where id = new.org_id and per_org_numbering) then
    new.estimate_number := public.next_org_number(new.org_id, 'estimate');
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_per_org_estimate_number on public.estimates;
create trigger trg_per_org_estimate_number
  before insert on public.estimates
  for each row execute function public.trg_per_org_estimate_number();
