-- Estimates get a Comments tab (same shared `comments` table already used by
-- POs, requisitions, work orders, etc.) — widen the record_type allow-list.
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_record_type_check;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_record_type_check
  CHECK (record_type IN ('requisition','po','receiving','project','work_order','job_photo','damage_case','ticket','crm_estimate'));
