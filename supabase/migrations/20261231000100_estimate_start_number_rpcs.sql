-- "Start estimates at #N" — mirrors set_next_invoice_number / get_invoice_numbering.
-- Estimates draw from the per-org counter (entity_type 'estimate') once the org is flagged
-- per_org_numbering; flagging an existing org seeds the invoice / ticket counters at their current
-- highest number so switching never restarts those sequences at 1.

create or replace function public.set_next_estimate_number(p_next integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid := public.my_org_id();
  v_was_per_org boolean;
  v_max integer;
  v_effective integer;
begin
  if v_org is null then
    raise exception 'No organization for the current user' using errcode = '42501';
  end if;
  if not (public.my_role() in ('admin', 'manager')
          or coalesce(public.has_settings_permission('crm_settings'), false)
          or coalesce(public.has_settings_permission('accounting_settings'), false)) then
    raise exception 'Not permitted to change estimate numbering' using errcode = '42501';
  end if;
  if p_next is null or p_next < 1 or p_next > 2000000000 then
    raise exception 'Estimate number must be between 1 and 2,000,000,000' using errcode = '22023';
  end if;

  select coalesce(per_org_numbering, false) into v_was_per_org from public.organizations where id = v_org for update;

  if not v_was_per_org then
    insert into public.entity_number_counters (org_id, entity_type, period, count)
    values (v_org, 'crm_invoice', 'all',
            coalesce((select max(i.invoice_number) from public.crm_invoices i where i.org_id = v_org), 0))
    on conflict (org_id, entity_type, period) do nothing;

    insert into public.entity_number_counters (org_id, entity_type, period, count)
    values (v_org, 'crm_ticket', 'all',
            coalesce((select max(t.ticket_number) from public.crm_tickets t where t.org_id = v_org), 0))
    on conflict (org_id, entity_type, period) do nothing;

    update public.organizations set per_org_numbering = true where id = v_org;
  end if;

  -- Never go below the highest number already in use (live or deleted) so numbers stay unique.
  select coalesce(max(e.estimate_number), 0) into v_max from public.estimates e where e.org_id = v_org;
  v_effective := greatest(p_next, v_max + 1);

  insert into public.entity_number_counters (org_id, entity_type, period, count)
  values (v_org, 'estimate', 'all', v_effective - 1)
  on conflict (org_id, entity_type, period) do update set count = v_effective - 1;

  return v_effective;
end;
$function$;
revoke all on function public.set_next_estimate_number(integer) from public, anon;
grant execute on function public.set_next_estimate_number(integer) to authenticated;

create or replace function public.get_estimate_numbering()
returns table(next_number integer, max_existing integer, per_org boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid := public.my_org_id();
  v_per_org boolean;
  v_next integer;
begin
  if v_org is null then
    raise exception 'No organization for the current user' using errcode = '42501';
  end if;
  select coalesce(o.per_org_numbering, false) into v_per_org from organizations o where o.id = v_org;
  if v_per_org then
    select coalesce(c.count, 0) + 1 into v_next
      from entity_number_counters c
     where c.org_id = v_org and c.entity_type = 'estimate' and c.period = 'all';
    v_next := coalesce(v_next, 1);
  else
    v_next := null; -- shared global sequence; assigned automatically
  end if;
  return query
    select v_next,
           (select max(e.estimate_number) from estimates e where e.org_id = v_org),
           v_per_org;
end;
$function$;
revoke all on function public.get_estimate_numbering() from public, anon;
grant execute on function public.get_estimate_numbering() to authenticated;
