-- Audit Log: say WHICH record changed.
-- Line-item rows are rolled up to their parent estimate/invoice, but the log only
-- showed "Estimate" with no number, so a change could not be tied to a record.
-- Appends record_ref (e.g. "#282") to rpt_audit_log. CREATE OR REPLACE VIEW may only
-- add columns at the end, so existing consumers are unaffected.

CREATE OR REPLACE VIEW public.rpt_audit_log
WITH (security_invoker = on) AS
SELECT
  a.id,
  a.created_at                                   AS occurred_at,
  a.record_type                                  AS record_kind,
  initcap(replace(a.record_type, '_', ' '))      AS record_label,
  a.record_id,
  a.action,
  a.changed_by_name                              AS changed_by,
  p.email                                        AS changed_by_email,
  a.description,
  a.field_changed,
  a.old_value,
  a.new_value,
  CASE
    WHEN a.record_type IN (
      'user', 'role', 'api_key', 'integration', 'oauth_token', 'approval_flow'
    ) THEN 'Security & Access'
    WHEN a.record_type IN (
      'invoice', 'estimate', 'contract', 'po', 'requisition', 'receiving',
      'project', 'financial_period', 'discount', 'overhead_settings'
    ) THEN 'Money'
    WHEN a.record_type IN (
      'job', 'job_visit', 'work_order', 'asset', 'vehicle', 'part',
      'pm_schedule', 'request', 'job_photo', 'damage_case', 'meter_reading',
      'crew', 'ticket', 'client'
    ) THEN 'Operations'
    ELSE 'Setup & Config'
  END                                            AS category,
  a.org_id,
  CASE a.record_type
    WHEN 'estimate' THEN '#' || e.estimate_number::text
    WHEN 'invoice'  THEN '#' || i.invoice_number::text
  END                                            AS record_ref
FROM public.audit_log a
LEFT JOIN public.profiles p ON p.id = a.created_by
LEFT JOIN public.estimates e ON a.record_type = 'estimate' AND e.id = a.record_id
LEFT JOIN public.crm_invoices i ON a.record_type = 'invoice' AND i.id = a.record_id
WHERE a.deleted_at IS NULL;
