-- Drop the vestigial est_document columns.
--
-- These were a pre-Documents design: a free-text label naming which "estimate
-- document" a template/estimate used. Nothing ever read them -- they were not
-- foreign keys to crm_document_templates, and no send or render path touched
-- them. Estimate EMAIL templates now live in crm_document_templates
-- (doc_type = 'estimate'), selected in SendEstimateDialog; estimate_templates
-- (the "Service Bundles" line-item sets) are a separate concept that never
-- needed a document reference.
--
-- Contents at drop time were placeholder strings only: 'default' on every
-- estimates row, 'Estimate - General' on the single estimate_templates row.
-- No views, functions, indexes, or constraints referenced either column.

alter table public.estimate_templates drop column if exists est_document;
alter table public.estimates          drop column if exists est_document;
