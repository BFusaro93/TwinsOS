-- Add 'job' as a valid attachments.record_type so Job screens can use the
-- shared AttachmentsSection component (same pattern as vendor/work_order/etc).
--
-- Also fixes a pre-existing gap: 'estimate' was already used by the app
-- (EstimateAttachmentsTab inserts record_type='estimate') but was never
-- added to this CHECK constraint, so those inserts have been failing the
-- constraint since the "Attachments" tab was built on Estimates.
ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_record_type_check;
-- crm_jobs.estimate_id: the mapper (use-crm-jobs.ts) and JobCostingTab have
-- referenced job.estimateId for a while, but the column never actually
-- existed on crm_jobs — every job's estimateId silently mapped to null.
-- Needed now so useCreateJobsFromEstimate can link a job back to the
-- estimate its photos/attachments were copied from.
ALTER TABLE public.crm_jobs ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES public.estimates(id);
CREATE INDEX IF NOT EXISTS crm_jobs_estimate_id_idx ON public.crm_jobs(estimate_id) WHERE deleted_at IS NULL;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_record_type_check
  CHECK (record_type = ANY (ARRAY[
    'requisition'::text, 'po'::text, 'receiving'::text, 'project'::text, 'work_order'::text,
    'request'::text, 'vehicle'::text, 'asset'::text, 'vendor'::text,
    'ticket'::text, 'damage_case'::text, 'contract'::text,
    'estimate'::text, 'job'::text
  ]));
