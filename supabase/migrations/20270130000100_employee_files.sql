-- Employee Files tab: license copies, DOT medical cards, I-9s, signed policies.
--
-- Files live in the shared `attachments` table / bucket (record_type 'employee'),
-- with a document_type so a later report can flag employees missing a required
-- document.
--
-- Privacy: employee files are visible only to people who may see employee
-- information (View Employee Information, Edit or Manage Employees; admins
-- always) — the same gate as crm_list_employees(). It is a RESTRICTIVE policy on
-- `attachments`, and the `attachments` bucket's read / delete policies resolve
-- access through an EXISTS on that table under the caller's RLS, so the files
-- themselves are protected too, not just the rows.
--
-- Additive: safe to apply before or after the code deploy.

alter table public.attachments drop constraint if exists attachments_record_type_check;
alter table public.attachments add constraint attachments_record_type_check
  check (record_type in ('requisition','po','receiving','project','work_order','request','vehicle',
                         'asset','vendor','ticket','damage_case','contract','estimate','job',
                         'injury_case','product','employee'));

alter table public.attachments add column if not exists document_type text;
alter table public.attachments drop constraint if exists attachments_document_type_check;
alter table public.attachments add constraint attachments_document_type_check
  check (document_type is null
         or document_type in ('drivers_license','dot_medical_card','hoisting_license','i9','other'));

create or replace function public.can_access_employee_files()
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $$
  select auth.role() = 'service_role'
      or public.has_settings_permission('emp_view_info')
      or public.has_settings_permission('emp_edit')
      or public.has_settings_permission('emp_manage');
$$;
revoke all on function public.can_access_employee_files() from public, anon;
grant execute on function public.can_access_employee_files() to authenticated, service_role;

drop policy if exists employee_files_require_employee_access on public.attachments;
create policy employee_files_require_employee_access on public.attachments
  as restrictive
  for all
  to authenticated
  using (record_type <> 'employee' or (select public.can_access_employee_files()))
  with check (record_type <> 'employee' or (select public.can_access_employee_files()));

notify pgrst, 'reload schema';
