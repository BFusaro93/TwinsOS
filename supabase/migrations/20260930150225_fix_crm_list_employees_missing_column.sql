-- crm_list_employees() masked r.labor_burden_cents_per_hour, a column that
-- does not exist on crm_employees. plpgsql only resolves the field when the
-- assignment runs, i.e. only for callers WITHOUT pay permission -- so every
-- technician/purchaser/etc. got an error and every employee picker (WO
-- assignee, new WO dialog, ...) came back empty. Admins never hit the branch.
create or replace function public.crm_list_employees(p_employee_id uuid default null)
returns setof public.crm_employees
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org      uuid := public.my_org_id();
  v_edit     boolean;
  v_identity boolean;
  v_license  boolean;
  v_pay      boolean;
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
$$;
