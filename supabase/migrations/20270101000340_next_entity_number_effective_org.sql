-- Sequential numbers (WO / PO / REQ / GR / request) use the effective org.
--
-- next_entity_number read profiles.org_id for the caller. Support staff
-- impersonating a customer org write into that org (my_org_id() returns the
-- impersonated org), but drew numbers from their OWN org's counter — so the
-- customer's work orders, POs and requisitions got numbers out of sequence,
-- and a number already used in the customer org collided with
-- work_orders_org_number_unique. It now uses my_org_id(), the same org every
-- RLS policy and insert default uses. For everyone else my_org_id() is still
-- profiles.org_id (and NULL for a deactivated profile, which is refused).
--
-- The service-role override (Zapier / API / automation callers that pass the
-- org explicitly) is unchanged. Replaces next_entity_number(text, text, uuid)
-- — latest 20260901080000_atomic_sequential_numbers; grants re-stated.

create or replace function public.next_entity_number(
  p_entity_type     text,
  p_prefix          text,
  p_org_id_override uuid default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_year   text := to_char(now(), 'YYYY');
  v_org_id uuid;
  v_count  int;
begin
  if p_org_id_override is not null and auth.role() = 'service_role' then
    v_org_id := p_org_id_override;
  else
    v_org_id := public.my_org_id();
  end if;
  if v_org_id is null then
    raise exception 'No org for current user';
  end if;

  insert into public.entity_number_counters (org_id, entity_type, period, count)
  values (v_org_id, p_entity_type, v_year, 1)
  on conflict (org_id, entity_type, period)
    do update set count = public.entity_number_counters.count + 1
  returning count into v_count;

  return p_prefix || '-' || v_year || '-' || lpad(v_count::text, 6, '0');
end;
$function$;

revoke all on function public.next_entity_number(text, text, uuid) from public, anon;
grant execute on function public.next_entity_number(text, text, uuid) to authenticated, service_role;
