-- "Start invoices at #N" — for orgs migrating from another system who want the next invoice to
-- continue their old sequence. Draws from the per-org counter (see 20261130001600), switching
-- the org onto it. (The card surcharge mode lives in organizations.customizations, no column.)
create or replace function public.set_next_invoice_number(p_next integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid := public.my_org_id();
begin
  if v_org is null then
    raise exception 'No organization for the current user' using errcode = '42501';
  end if;
  if not (public.my_role() in ('admin', 'manager') or coalesce(public.has_settings_permission('crm_settings'), false)) then
    raise exception 'Not permitted to change invoice numbering' using errcode = '42501';
  end if;
  if p_next is null or p_next < 1 or p_next > 2000000000 then
    raise exception 'Invoice number must be between 1 and 2,000,000,000' using errcode = '22023';
  end if;

  update public.organizations set per_org_numbering = true where id = v_org;

  insert into public.entity_number_counters (org_id, entity_type, period, count)
  values (v_org, 'crm_invoice', 'all', p_next - 1)
  on conflict (org_id, entity_type, period) do update set count = p_next - 1;

  return p_next;
end;
$function$;
revoke all on function public.set_next_invoice_number(integer) from public, anon;
grant execute on function public.set_next_invoice_number(integer) to authenticated;

-- The number the next invoice will get (without consuming it), plus the highest live number, so
-- Settings can show it and warn when a chosen start would overlap invoices that already exist.
create or replace function public.get_invoice_numbering()
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
     where c.org_id = v_org and c.entity_type = 'crm_invoice' and c.period = 'all';
    v_next := coalesce(v_next, 1);
  else
    select case when s.is_called then s.last_value + 1 else s.last_value end into v_next from crm_invoices_number_seq s;
  end if;
  return query
    select v_next,
           (select max(i.invoice_number) from crm_invoices i where i.org_id = v_org and i.deleted_at is null),
           v_per_org;
end;
$function$;
revoke all on function public.get_invoice_numbering() from public, anon;
grant execute on function public.get_invoice_numbering() to authenticated;
