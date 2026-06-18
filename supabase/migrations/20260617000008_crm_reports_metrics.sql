-- Add structured metrics column to crm_reports so KPI Scorecard can pull sales figures.
-- Claude populates this alongside html_content when generating the report.
alter table public.crm_reports
  add column if not exists metrics jsonb;
