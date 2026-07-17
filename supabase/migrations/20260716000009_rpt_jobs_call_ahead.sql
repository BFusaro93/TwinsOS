-- Adds call_ahead flag and client phone to rpt_jobs so a "Call Ahead
-- Required" report can be built in the Report Center.
-- Rebuilt from the live view definition (pg_get_viewdef on prod), not the
-- original 20260706000010 migration file, since sales_rep has since drifted
-- to a profiles join (sr.name) rather than a raw column.
-- New columns must be appended at the end of the SELECT list — Postgres'
-- CREATE OR REPLACE VIEW forbids reordering/inserting existing columns.
create or replace view rpt_jobs
with (security_invoker = on) as
select
  j.id,
  j.job_number,
  c.display_name as client_name,
  j.job_type,
  j.status,
  j.sub_status,
  j.scheduled_date,
  j.date_sold,
  j.source,
  sr.name as sales_rep,
  cw.name as crew_name,
  (select string_agg(js.service_name, ', ' order by js.sort_order)
     from crm_job_services js where js.job_id = j.id) as service_names,
  j.man_count,
  j.rate_cents,
  j.budgeted_hours,
  j.actual_hours,
  j.service_total_cents,
  j.product_total_cents,
  j.tax_cents,
  j.total_cents,
  j.service_address,
  j.service_city,
  j.service_zip,
  j.package_name,
  (j.contract_id is not null) as under_contract,
  j.is_complete,
  j.created_at,
  c.primary_phone as client_phone,
  j.call_ahead
from crm_jobs j
join clients c on c.id = j.client_id and c.deleted_at is null
left join crm_crews cw on cw.id = j.crew_id
left join profiles sr on sr.id = j.sales_rep_id
where j.deleted_at is null;
