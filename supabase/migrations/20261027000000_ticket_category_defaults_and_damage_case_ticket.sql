-- 1. Default ticket categories for every org. Orgs created after 20260718052046 got none (Settings >
--    Ticket Categories was empty, and the portal had nothing to offer). Seed on organization creation,
--    and backfill orgs that have never had any row (an org that deleted all of its own is left alone).
--    Users can still rename/delete any of them.
create or replace function public.fn_seed_default_ticket_categories()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into crm_list_options (org_id, list_name, value, sort_order)
  values
    (NEW.id, 'ticket_categories', 'Uncategorized',            1),
    (NEW.id, 'ticket_categories', 'Estimate',                 2),
    (NEW.id, 'ticket_categories', 'Billing',                  3),
    (NEW.id, 'ticket_categories', 'Change Service',           4),
    (NEW.id, 'ticket_categories', 'Schedule Service',         5),
    (NEW.id, 'ticket_categories', 'Complaint',                6),
    (NEW.id, 'ticket_categories', 'Damage / Warranty',        7),
    (NEW.id, 'ticket_categories', 'Need to Contact Customer', 8),
    (NEW.id, 'ticket_categories', 'Client Portal Message',    9),
    (NEW.id, 'ticket_categories', 'Terminate Service',       10),
    (NEW.id, 'ticket_categories', 'Other',                   11)
  on conflict (org_id, list_name, value) do nothing;
  return NEW;
end;
$function$;

do $do$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_seed_default_ticket_categories') then
    create trigger trg_seed_default_ticket_categories
      after insert on public.organizations
      for each row execute function public.fn_seed_default_ticket_categories();
  end if;
end
$do$;

insert into crm_list_options (org_id, list_name, value, sort_order)
select o.id, 'ticket_categories', v.value, v.sort_order
from organizations o
cross join (values
  ('Uncategorized', 1), ('Estimate', 2), ('Billing', 3), ('Change Service', 4),
  ('Schedule Service', 5), ('Complaint', 6), ('Damage / Warranty', 7),
  ('Need to Contact Customer', 8), ('Client Portal Message', 9),
  ('Terminate Service', 10), ('Other', 11)
) as v(value, sort_order)
where not exists (
  select 1 from crm_list_options l where l.org_id = o.id and l.list_name = 'ticket_categories'
)
on conflict (org_id, list_name, value) do nothing;

-- 2a. Tickets can link to a damage case (crm_ticket_links.link_type + its org-match guard).
alter table public.crm_ticket_links drop constraint if exists crm_ticket_links_link_type_check;
alter table public.crm_ticket_links
  add constraint crm_ticket_links_link_type_check
  check (link_type in ('estimate','invoice','job','project','damage_case'));

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
  elsif new.link_type = 'damage_case' then
    select exists(select 1 from public.damage_cases where id = new.linked_id and org_id = new.org_id) into v_ok;
  else
    v_ok := false;
  end if;

  if not v_ok then
    raise exception 'linked_id must belong to the same org as this ticket link';
  end if;

  return new;
end;
$$;

-- 2b. Every new damage case opens a ticket for the office to follow up on. Done in the DB (not the
--    client) so it works for crew logins, whose RLS on crm_tickets is restricted, and for both the
--    office dialog and the crew form. The client is matched by exact (trimmed, case-insensitive)
--    name and only when unambiguous; otherwise the ticket is created without one.
create or replace function public.fn_damage_case_open_ticket()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client uuid;
  v_ticket uuid;
begin
  select c.id into v_client
  from clients c
  where c.org_id = NEW.org_id
    and c.deleted_at is null
    and lower(trim(c.display_name)) = lower(trim(NEW.customer_name))
  limit 2;
  if (select count(*) from clients c
      where c.org_id = NEW.org_id and c.deleted_at is null
        and lower(trim(c.display_name)) = lower(trim(NEW.customer_name))) <> 1 then
    v_client := null;
  end if;

  insert into crm_tickets (org_id, type, status, priority, category, client_id, subject, body, created_by)
  values (
    NEW.org_id, 'note', 'open', 'normal', 'Damage / Warranty', v_client,
    initcap(NEW.case_type) || ' report ' || NEW.case_number || ' — ' || NEW.customer_name,
    NEW.description
      || case when coalesce(NEW.property_address, '') <> '' then E'\nAddress: ' || NEW.property_address else '' end
      || E'\nDate of incident: ' || NEW.date_of_incident::text
      || E'\nDamage case: ' || NEW.case_number,
    NEW.created_by
  )
  returning id into v_ticket;

  insert into crm_ticket_links (org_id, ticket_id, link_type, linked_id, linked_label, created_by)
  values (NEW.org_id, v_ticket, 'damage_case', NEW.id, NEW.case_number || ' — ' || NEW.customer_name, NEW.created_by);

  if v_client is not null then
    begin
      insert into client_activity (org_id, client_id, activity_type, subject, body, status, ref_id, ref_table, created_by)
      values (NEW.org_id, v_client, 'ticket',
              initcap(NEW.case_type) || ' report ' || NEW.case_number, NEW.description, 'open',
              v_ticket, 'crm_tickets', NEW.created_by);
    exception when others then
      null; -- timeline entry is best-effort; never block the damage case
    end;
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_damage_case_open_ticket on public.damage_cases;
create trigger trg_damage_case_open_ticket
  after insert on public.damage_cases
  for each row execute function public.fn_damage_case_open_ticket();

revoke execute on function public.fn_damage_case_open_ticket() from public, anon, authenticated;
revoke execute on function public.fn_seed_default_ticket_categories() from public, anon, authenticated;
