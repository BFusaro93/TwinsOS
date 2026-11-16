-- audit_log: crew logins can't read the change history.
--
-- Office roles keep the org-wide trail they had (every record type except the
-- security/HR ones, which stay limited to admins/managers and the audit-report
-- and employee keys). A crew login is a shared field account: its trail rows
-- narrated client contact changes, invoice and estimate amounts, and pay-rate
-- edits for records it otherwise can't open. rpt_audit_log is security_invoker,
-- so the Report Center's audit dataset follows this policy automatically.
--
-- Writes are unaffected: fn_audit_log inserts as SECURITY DEFINER.
-- Safe BEFORE the deploy (no crew screen reads audit_log).

drop policy if exists org_members_read_audit_log on public.audit_log;
create policy org_members_read_audit_log on public.audit_log
  for select
  using (
    org_id = (select public.my_org_id())
    and (select public.my_role()) is distinct from 'crew'
    and (
      record_type <> all (array['employee', 'user', 'role', 'api_key', 'integration', 'oauth_token', 'organization', 'job_costing_scenario'])
      or (select public.my_role()) = any (array['admin', 'manager'])
      or (select public.has_settings_permission('admin_rpt_audit_log'))
      or (select public.has_settings_permission('admin_rpt_security_audit'))
      or (
        record_type = 'employee'
        and (
          (select public.has_settings_permission('payroll_show_pay_rate'))
          or (select public.has_settings_permission('emp_edit'))
        )
      )
    )
  );
