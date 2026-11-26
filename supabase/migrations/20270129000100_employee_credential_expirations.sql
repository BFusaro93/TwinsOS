-- Employee credential expirations: DOT physical + hoisting license dates, next to
-- the existing driver license expiration, plus an "expiring soon" report.
--
-- The new dates follow the SAME privacy rule as License Info: hidden from anyone
-- without Edit/Manage Employees or View License Info. Direct SELECT is revoked
-- (the grant_new_readable_columns event trigger would otherwise auto-grant it);
-- they are read through crm_list_employees() (Employees page) and
-- crm_employee_credentials() (rpt_employees).
--
-- Additive only: safe to apply before or after the code deploy.

alter table public.crm_employees
  add column if not exists dot_physical_expiration date,
  add column if not exists hoisting_license_expiration date;

revoke select (dot_physical_expiration, hoisting_license_expiration, license_expiration)
  on public.crm_employees from anon, authenticated;

create or replace function public.crm_employee_credentials(p_employee_id uuid default null)
 returns table (
   id uuid,
   license_expiration date,
   dot_physical_expiration date,
   hoisting_license_expiration date
 )
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select e.id, e.license_expiration, e.dot_physical_expiration, e.hoisting_license_expiration
  from public.crm_employees e
  where e.deleted_at is null
    and (p_employee_id is null or e.id = p_employee_id)
    and (
      auth.role() = 'service_role'
      or (auth.uid() is null and auth.role() is null)
      or (
        public.my_org_id() is not null
        and e.org_id = public.my_org_id()
        and (
          public.has_settings_permission('emp_view_license_info')
          or public.has_settings_permission('emp_edit')
          or public.has_settings_permission('emp_manage')
        )
      )
    );
$$;
revoke all on function public.crm_employee_credentials(uuid) from public, anon;
grant execute on function public.crm_employee_credentials(uuid) to authenticated, service_role;

-- Employees page RPC: same masks as before; the two new credential dates follow License Info.
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
      r.dot_physical_expiration := null; r.hoisting_license_expiration := null;
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

-- Report view: existing columns and order unchanged; credential dates appended.
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
    e.org_id,
    cr.license_expiration,
    cr.dot_physical_expiration,
    cr.hoisting_license_expiration,
    least(cr.license_expiration, cr.dot_physical_expiration, cr.hoisting_license_expiration) as next_credential_expiry
from public.crm_employees e
left join public.crm_employee_contacts() c on c.id = e.id
left join public.crm_employee_credentials() cr on cr.id = e.id
where e.deleted_at is null;

notify pgrst, 'reload schema';
