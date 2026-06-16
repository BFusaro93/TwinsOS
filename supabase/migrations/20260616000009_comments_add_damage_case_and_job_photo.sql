-- Expand the comments.record_type CHECK constraint to include damage_case and job_photo.
-- The constraint must be dropped and recreated since PostgreSQL doesn't support ALTER CHECK.
ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_record_type_check;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_record_type_check
  CHECK (record_type IN ('requisition', 'po', 'receiving', 'project', 'work_order', 'job_photo', 'damage_case'));
