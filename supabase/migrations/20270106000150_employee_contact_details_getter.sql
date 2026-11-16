-- Round 14 (equipt F4, part 1 of 2): employee contact details are visible
-- only to people allowed to see employee information.
--
-- Owner decision: names for everyone; contact details (home address, city,
-- zip, phones, emergency contact, notes, manager, starting address and
-- coordinates) only with Edit Employee / Manage Employees / View Employee
-- Information (admins always). A person always sees their own row.
--
-- 1. crm_employee_contacts(p_employee_id): SECURITY DEFINER getter returning
--    those columns for the caller's org, only for employees the caller may
--    see (all of them with the keys above, otherwise just their own row).
--    The service role and in-database calls get every row (trusted callers;
--    scheduled reports check the owner's permissions themselves).
-- 2. crm_list_employees() (the Employees page / pickers RPC) now also blanks
--    those columns unless permitted. Notes also show with View Resource Notes.
-- 3. rpt_employees reads phone / cell_phone / city / emergency contact through
--    the getter (same columns, same order; still security_invoker).
--
-- Part 2 (20270106000160, AFTER deploy) revokes direct SELECT on the columns.
-- Deploy order for this file: BEFORE or AFTER the code deploy (no app change
-- depends on it; it must be applied before 20270106000160).

create or replace function public.crm_employee_contacts(p_employee_id uuid default null)
 returns table (
   id uuid,
   address text,
   city text,
   zip text,
   phone text,
   cell_phone text,
   emergency_contact text,
   emergency_phone text,
   notes text,
   manager_id uuid,
   starting_address text,
   starting_city text,
   starting_state text,
   starting_zip text,
   starting_lat numeric,
   starting_lng numeric
 )
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_trusted boolean := coalesce(auth.role(), '') = 'service_role'
                       or (auth.uid() is null and auth.role() is null);
  v_org     uuid;
  v_all     boolean;
  v_notes   boolean;
begin
  if v_trusted then
    return query
      select e.id, e.address, e.city, e.zip, e.phone, e.cell_phone, e.emergency_contact,
             e.emergency_phone, e.notes, e.manager_id, e.starting_address, e.starting_city,
             e.starting_state, e.starting_zip, e.starting_lat, e.starting_lng
      from public.crm_employees e
      where e.deleted_at is null
        and (p_employee_id is null or e.id = p_employee_id);
    return;
  end if;

  v_org := public.my_org_id();
  if v_org is null then
    return;
  end if;
  v_all := public.has_settings_permission('emp_edit')
        or public.has_settings_permission('emp_manage')
        or public.has_settings_permission('emp_view_info');
  v_notes := v_all or public.has_settings_permission('emp_view_resource_notes');

  return query
    with base as (
      select e.*, (v_all or e.user_id = auth.uid()) as can_see
      from public.crm_employees e
      where e.org_id = v_org
        and e.deleted_at is null
        and (p_employee_id is null or e.id = p_employee_id)
    )
    select b.id,
           case when b.can_see then b.address end,
           case when b.can_see then b.city end,
           case when b.can_see then b.zip end,
           case when b.can_see then b.phone end,
           case when b.can_see then b.cell_phone end,
           case when b.can_see then b.emergency_contact end,
           case when b.can_see then b.emergency_phone end,
           case when b.can_see or v_notes then b.notes end,
           case when b.can_see then b.manager_id end,
           case when b.can_see then b.starting_address end,
           case when b.can_see then b.starting_city end,
           case when b.can_see then b.starting_state end,
           case when b.can_see then b.starting_zip end,
           case when b.can_see then b.starting_lat end,
           case when b.can_see then b.starting_lng end
    from base b
    where b.can_see or v_notes;
end;
$function$;

revoke all on function public.crm_employee_contacts(uuid) from public, anon;
grant execute on function public.crm_employee_contacts(uuid) to authenticated, service_role;

-- Employees page RPC: keep every existing mask, add the contact mask.
create or replace function public.crm_list_employees(p_employee_id uuid default null::uuid)
 returns setof crm_employees
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_org      uuid := public.my_org_id();
  v_edit     boolean;
  v_identity boolean;
  v_license  boolean;
  v_pay      boolean;
  v_notes    boolean;
  r          public.crm_employees%rowtype;
begin
  if v_org is null then
    return;
  end if;

  v_edit     := public.has_settings_permission('emp_edit') or public.has_settings_permission('emp_manage');
  v_identity := v_edit or public.has_settings_permission('emp_view_info');
  v_license  := v_edit or public.has_settings_permission('emp_view_license_info');
  v_pay      := v_edit or public.has_settings_permission('payroll_show_pay_rate')
                       or public.has_settings_permission('payroll_show_wage_burden');
  v_notes    := v_identity or public.has_settings_permission('emp_view_resource_notes');

  for r in
    select * from public.crm_employees e
    where e.org_id = v_org
      and e.deleted_at is null
      and (p_employee_id is null or e.id = p_employee_id)
  loop
    if not v_identity then
      r.birth_date := null; r.citizenship := null; r.marital_status := null;
      r.num_dependants := null; r.spouse_name := null; r.spouse_phone := null;
      r.i9_number := null; r.i9_expiration_date := null; r.reason_for_release := null;
    end if;
    -- Contact details: Edit/Manage Employees or View Employee Information,
    -- or the person's own row.
    if not v_identity and r.user_id is distinct from auth.uid() then
      r.address := null; r.city := null; r.zip := null;
      r.phone := null; r.cell_phone := null;
      r.emergency_contact := null; r.emergency_phone := null;
      r.manager_id := null;
      r.starting_address := null; r.starting_city := null; r.starting_state := null;
      r.starting_zip := null; r.starting_lat := null; r.starting_lng := null;
      if not v_notes then
        r.notes := null;
      end if;
    end if;
    if not v_license then
      r.driver_license := null; r.license_expiration := null;
    end if;
    if not v_pay then
      r.hourly_rate_cents := null; r.overtime_rate_cents := null; r.commission_pct := null;
      r.last_pay_raise_cents := null; r.last_pay_raise_date := null;
    end if;
    if not v_edit then
      r.resource_pin := null;
    end if;
    return next r;
  end loop;
end;
$function$;

-- Report view: same columns and order as before; contact columns via getter.
create or replace view public.rpt_employees
with (security_invoker = true)
as
select e.id,
    trim(both from ((coalesce(e.first_name, ''::text) || ' '::text) || coalesce(e.last_name, ''::text))) as full_name,
    e.first_name,
    e.last_name,
    e.email,
    c.phone,
    c.cell_phone,
    c.city,
    e.state,
    e.employment_status,
    e.compensation_type,
    public.crm_employee_hourly_rate_cents(e.id) as hourly_rate_cents,
    e.user_type,
    e.resource_code,
    e.applicator_license,
    e.is_sales_rep,
    e.is_active,
    e.date_hired,
    c.emergency_contact,
    c.emergency_phone,
    e.org_id
from public.crm_employees e
left join public.crm_employee_contacts() c on c.id = e.id
where e.deleted_at is null;
