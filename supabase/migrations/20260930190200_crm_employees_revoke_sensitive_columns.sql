-- ============================================================
-- crm_employees: remove direct SELECT on sensitive columns.
--
-- APPLY AFTER THE DEPLOY. The previously deployed client read crm_employees
-- with select("*") and embedded pay columns; it breaks under this. The new
-- client reads full rows through crm_list_employees() (20260930190000, which
-- also re-points rpt_employees / rpt_job_visits at definer helpers) and only
-- selects / embeds non-sensitive columns directly.
--
-- `authenticated` loses table-level SELECT and gets column-level SELECT on
-- every column EXCEPT the sensitive ones below. Pickers, dispatch, reports,
-- embeds (`sales_rep:crm_employees(first_name, last_name)`) keep working.
-- Writes are unaffected (INSERT/UPDATE privileges are not touched), but an
-- insert/update that asks for the row back must list only granted columns.
--
-- !! New crm_employees columns are NOT readable by `authenticated` until
--    they are granted: re-run the DO block below (idempotent) after adding
--    a column, or add it to the sensitive list.
-- ============================================================

do $$
declare
  v_sensitive constant text[] := array[
    'birth_date','citizenship','marital_status','num_dependants',
    'spouse_name','spouse_phone','i9_number','i9_expiration_date',
    'reason_for_release','driver_license','license_expiration',
    'hourly_rate_cents','overtime_rate_cents','commission_pct',
    'last_pay_raise_cents','last_pay_raise_date','labor_burden_cents_per_hour',
    'resource_pin'
  ];
  r record;
begin
  execute 'revoke select on table public.crm_employees from anon, authenticated';
  for r in
    select a.attname
    from pg_attribute a
    where a.attrelid = 'public.crm_employees'::regclass
      and a.attnum > 0 and not a.attisdropped
  loop
    if r.attname = any (v_sensitive) then
      execute format('revoke select (%I) on public.crm_employees from anon, authenticated', r.attname);
    else
      execute format('grant select (%I) on public.crm_employees to authenticated', r.attname);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
