-- Backfill audit log entries for damage cases that existed before the trigger was attached.
-- Only inserts if no audit entry already exists for that case.
INSERT INTO public.audit_log (org_id, created_by, record_type, record_id, action, changed_by_name, description, created_at)
SELECT
  dc.org_id,
  dc.created_by,
  'damage_case',
  dc.id,
  'created',
  COALESCE(p.name, 'System'),
  'Damage case created: ' || dc.case_number,
  dc.created_at
FROM public.damage_cases dc
LEFT JOIN public.profiles p ON p.id = dc.created_by
WHERE dc.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_log al
    WHERE al.record_type = 'damage_case'
      AND al.record_id = dc.id
  );
