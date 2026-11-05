-- Write guards found in the projects / photos / equipment audit.
--
-- 1. project_direct_items / project_subcontract_costs: 20260929140000 scoped the
--    limited-role write guards to Equipt tables and 20261111040200 restored them on
--    projects only, so an Equipt viewer or requestor could add, change or delete a
--    project's direct and subcontract costs (moving the project total and the WIP
--    report). Same restrictive policies as projects.
--
-- 2. Line-item project category: guard_line_item_project_category only re-checked
--    when project_id changed, so swapping a project line's product (or part) for a
--    maintenance part kept the project, and receiving then skipped Parts inventory.
--    It now re-checks when product_item_id or part_id changes too. Recategorising a
--    product to maintenance_part is refused while an open PO / requisition line for
--    it is assigned to a project.
--
-- 3. Photos: the UPDATE policies on job_photos / photo_jobs / photo_comparisons let
--    technicians write, and the app deletes by setting deleted_at — so a technician
--    could delete what the UI (usePhotoAccess: admin/manager only) never offers.
--    Setting deleted_at now requires the delete roles.
--
-- 4. Crew equipment (crm_crew_default_assets, crm_crew_daily_assets, crm_job_assets):
--    policies only checked org_id, and the foreign keys don't check the referenced
--    row's org, so a row could point at another org's asset or vehicle — and because
--    asset_id / vehicle_id are unique, that org could then never assign its own asset.
--    A trigger now requires the crew, job, asset and vehicle to be in NEW.org_id. With
--    that in place the existing unique keys are per org in practice, so they (and the
--    client's upsert conflict targets) stay as they are.
--
-- 5. Photo storage (job-photos-original / job-photos-annotated): the policies matched
--    the object's org folder against profiles.org_id, so staff impersonating a company
--    (my_org_id override) couldn't upload or view its photos; the upload hooks also
--    took org_id from profiles. Policies now use my_org_id() (otherwise unchanged,
--    regenerated from the live definitions), and usePhotoUpload /
--    useCreatePhotoComparison resolve the org with the my_org_id RPC.

-- 1 ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['project_direct_items', 'project_subcontract_costs'] loop
    execute format('drop policy if exists role_write_guard_ins on public.%I', t);
    execute format('drop policy if exists role_write_guard_upd on public.%I', t);
    execute format('drop policy if exists role_write_guard_del on public.%I', t);
    execute format($p$create policy role_write_guard_ins on public.%I
      as restrictive for insert
      with check (coalesce((select public.my_role()), '') <> all (array['viewer', 'requestor']))$p$, t);
    execute format($p$create policy role_write_guard_upd on public.%I
      as restrictive for update
      using (coalesce((select public.my_role()), '') <> all (array['viewer', 'requestor']))
      with check (coalesce((select public.my_role()), '') <> all (array['viewer', 'requestor']))$p$, t);
    execute format($p$create policy role_write_guard_del on public.%I
      as restrictive for delete
      using (coalesce((select public.my_role()), '') <> all (array['viewer', 'requestor']))$p$, t);
  end loop;
end $$;

-- 2 ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_line_item_project_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_maint_part boolean;
BEGIN
  -- Re-validate only when the project or the item itself changes — an unrelated
  -- field edit (quantity, unit cost) on a row from before this guard existed must
  -- not be blocked by a project_id it didn't just set.
  IF TG_OP = 'UPDATE'
     AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
     AND NEW.product_item_id IS NOT DISTINCT FROM OLD.product_item_id
     AND NEW.part_id IS NOT DISTINCT FROM OLD.part_id THEN
    RETURN NEW;
  END IF;
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.part_id IS NOT NULL THEN
    v_is_maint_part := true;
  ELSIF NEW.product_item_id IS NOT NULL THEN
    SELECT (category = 'maintenance_part') INTO v_is_maint_part
    FROM public.product_items WHERE id = NEW.product_item_id;
  ELSE
    v_is_maint_part := false;
  END IF;
  IF v_is_maint_part IS TRUE THEN
    RAISE EXCEPTION 'A maintenance_part line item cannot be assigned to a project'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

create or replace function public.guard_product_maintenance_category_on_project_lines()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category = 'maintenance_part' and old.category is distinct from 'maintenance_part' then
    if exists (
         select 1 from public.po_line_items li
           join public.purchase_orders po on po.id = li.po_id
          where li.product_item_id = new.id and li.project_id is not null
            and po.deleted_at is null
            and po.status in ('requested', 'pending', 'approved', 'ordered', 'partially_fulfilled'))
       or exists (
         select 1 from public.requisition_line_items rli
           join public.requisitions r on r.id = rli.requisition_id
          where rli.product_item_id = new.id and rli.project_id is not null
            and r.deleted_at is null
            and r.status not in ('closed', 'rejected')) then
      raise exception '% is on open purchase orders or requisitions assigned to a project — remove the project from those lines before making it a maintenance part', new.name
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_product_maintenance_category_on_project_lines() from public, anon, authenticated;
drop trigger if exists trg_guard_product_maintenance_category on public.product_items;
create trigger trg_guard_product_maintenance_category
  before update of category on public.product_items
  for each row execute function public.guard_product_maintenance_category_on_project_lines();

-- 3 ─────────────────────────────────────────────────────────────────────────────
create or replace function public.guard_photo_soft_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null
     and auth.uid() is not null
     and not public.photo_role_allowed(array['admin', 'manager'], array['manager']) then
    raise exception 'You do not have permission to delete photos' using errcode = '42501';
  end if;
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['job_photos', 'photo_jobs', 'photo_comparisons'] loop
    execute format('drop trigger if exists trg_guard_photo_soft_delete on public.%I', t);
    execute format('create trigger trg_guard_photo_soft_delete before update of deleted_at on public.%I
                    for each row execute function public.guard_photo_soft_delete()', t);
  end loop;
end $$;

-- 4 ─────────────────────────────────────────────────────────────────────────────
create or replace function public.guard_crew_equipment_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id  uuid;
  v_crew_id uuid;
begin
  if new.asset_id is not null
     and not exists (select 1 from public.assets a where a.id = new.asset_id and a.org_id = new.org_id) then
    raise exception 'That equipment belongs to another company' using errcode = '23514';
  end if;
  if new.vehicle_id is not null
     and not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.org_id = new.org_id) then
    raise exception 'That vehicle belongs to another company' using errcode = '23514';
  end if;
  if tg_table_name = 'crm_job_assets' then
    v_job_id := (to_jsonb(new) ->> 'job_id')::uuid;
    if not exists (select 1 from public.crm_jobs j where j.id = v_job_id and j.org_id = new.org_id) then
      raise exception 'That job belongs to another company' using errcode = '23514';
    end if;
  else
    v_crew_id := (to_jsonb(new) ->> 'crew_id')::uuid;
    if not exists (select 1 from public.crm_crews c where c.id = v_crew_id and c.org_id = new.org_id) then
      raise exception 'That crew belongs to another company' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_crew_equipment_same_org() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['crm_crew_default_assets', 'crm_crew_daily_assets', 'crm_job_assets'] loop
    execute format('drop trigger if exists trg_guard_crew_equipment_same_org on public.%I', t);
    execute format('create trigger trg_guard_crew_equipment_same_org before insert or update on public.%I
                    for each row execute function public.guard_crew_equipment_same_org()', t);
  end loop;
end $$;

-- 5 ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "org_photo_annotated_insert" on storage.objects;
create policy "org_photo_annotated_insert" on storage.objects
  for insert to authenticated
  with check (((bucket_id = 'job-photos-annotated'::text) AND ((storage.foldername(name))[1] = (public.my_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text])) AND (profiles.photo_module_access = true))))));

drop policy if exists "org_photo_annotated_select" on storage.objects;
create policy "org_photo_annotated_select" on storage.objects
  for select to authenticated
  using (((bucket_id = 'job-photos-annotated'::text) AND ((storage.foldername(name))[1] = (public.my_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'crew'::text) OR ((profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'technician'::text, 'viewer'::text, 'purchaser'::text])) AND (profiles.photo_module_access = true))))))));

drop policy if exists "org_photo_annotated_update" on storage.objects;
create policy "org_photo_annotated_update" on storage.objects
  for update to authenticated
  using (((bucket_id = 'job-photos-annotated'::text) AND ((storage.foldername(name))[1] = (public.my_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text])) AND (profiles.photo_module_access = true))))))
  with check (((bucket_id = 'job-photos-annotated'::text) AND ((storage.foldername(name))[1] = (public.my_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text])) AND (profiles.photo_module_access = true))))));

drop policy if exists "org_photo_originals_delete" on storage.objects;
create policy "org_photo_originals_delete" on storage.objects
  for delete to authenticated
  using (((bucket_id = 'job-photos-original'::text) AND ((storage.foldername(name))[1] = (public.my_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text])) AND (profiles.photo_module_access = true))))));

drop policy if exists "org_photo_originals_insert" on storage.objects;
create policy "org_photo_originals_insert" on storage.objects
  for insert to authenticated
  with check (((bucket_id = 'job-photos-original'::text) AND ((storage.foldername(name))[1] = (public.my_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'crew'::text) OR ((profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'technician'::text])) AND (profiles.photo_module_access = true))))))));

drop policy if exists "org_photo_originals_select" on storage.objects;
create policy "org_photo_originals_select" on storage.objects
  for select to authenticated
  using (((bucket_id = 'job-photos-original'::text) AND ((storage.foldername(name))[1] = (public.my_org_id())::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'crew'::text) OR ((profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'technician'::text, 'viewer'::text, 'purchaser'::text])) AND (profiles.photo_module_access = true))))))));
