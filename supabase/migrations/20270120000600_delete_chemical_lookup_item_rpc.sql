-- Delete (soft) a Chemical Tracking list item, but only when nothing uses it.
-- Chemical records point at these items by id (rates, applications, the
-- default unit, and the target / area-treated id arrays); soft-deleting a used
-- item would blank its name on every old record. A used item should be turned
-- off (the existing switch) instead.
--
-- SECURITY DEFINER, scoped to my_org_id() (never a parameter), same list
-- permission as the settings page uses, not callable by anon.

create or replace function public.delete_chemical_lookup_item(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid := public.my_org_id();
  v_type text;
  v_uses bigint;
begin
  if auth.uid() is null or v_org is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select list_type into v_type from public.crm_chemical_lookup_items
   where id = p_id and org_id = v_org and deleted_at is null;
  if v_type is null then
    raise exception 'Item not found.' using errcode = 'P0002';
  end if;
  if not (public.has_settings_permission('crm_settings') or public.has_settings_permission('scheduling_settings')) then
    raise exception 'You do not have permission to edit chemical lists.' using errcode = '42501';
  end if;

  select
    (select count(*) from public.crm_chemical_application_rates r where r.org_id = v_org and p_id in (
        r.application_method_id, r.area_unit_id, r.dilution_chemical_unit_id, r.dilution_water_unit_id,
        r.mix_product_amount_unit_id, r.mix_product_total_unit_id, r.unit_of_measure_id))
  + (select count(*) from public.crm_chemical_applications a where a.org_id = v_org and (
        p_id in (a.application_method_id, a.solution_unit_of_measure_id, a.unit_of_measure_id)
        or p_id = any(coalesce(a.areas_treated_ids, '{}'::uuid[]))
        or p_id = any(coalesce(a.target_ids, '{}'::uuid[]))))
  + (select count(*) from public.crm_chemical_settings s where s.org_id = v_org and s.default_unit_of_measure_id = p_id)
  into v_uses;

  if v_uses > 0 then
    raise exception 'This item is used by % chemical record(s). Turn it off instead of deleting it.', v_uses using errcode = '23503';
  end if;

  update public.crm_chemical_lookup_items set deleted_at = now() where id = p_id and org_id = v_org;
end;
$function$;

revoke all on function public.delete_chemical_lookup_item(uuid) from public, anon;
grant execute on function public.delete_chemical_lookup_item(uuid) to authenticated;
