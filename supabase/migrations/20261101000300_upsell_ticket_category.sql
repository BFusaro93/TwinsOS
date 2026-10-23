-- "Upsell" is the category crew-submitted field upsells are filed under
-- (src/app/api/crm/crew/visits/[visitId]/upsell/route.ts), but it was never one of the
-- seeded ticket categories, so an org's Category picker/filter and Settings > Ticket
-- Categories list never showed it. Seed it for new orgs and add it to existing orgs that
-- use the category list. It is internal: the client portal's fallback list skips it.
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
    (NEW.id, 'ticket_categories', 'Other',                   11),
    (NEW.id, 'ticket_categories', 'Upsell',                  12)
  on conflict (org_id, list_name, value) do nothing;
  return NEW;
end;
$function$;

insert into crm_list_options (org_id, list_name, value, sort_order)
select distinct l.org_id, 'ticket_categories', 'Upsell',
       coalesce((select max(m.sort_order) from crm_list_options m
                 where m.org_id = l.org_id and m.list_name = 'ticket_categories'), 0) + 1
from crm_list_options l
where l.list_name = 'ticket_categories'
  and not exists (
    select 1 from crm_list_options u
    where u.org_id = l.org_id and u.list_name = 'ticket_categories' and u.value = 'Upsell'
  )
on conflict (org_id, list_name, value) do nothing;
