-- ── report views: point sales_rep at the new FK columns ────────────────────────
-- rpt_jobs/rpt_job_visits/rpt_contracts previously exposed the raw free-text
-- sales_rep column (now renamed to sales_rep_legacy_name). rpt_invoices
-- previously derived "sales rep" from the client's default rep rather than
-- the invoice's own transaction. All four now resolve the name via the new
-- sales_rep_id FK on the entity that actually owns it.

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
  j.created_at
from crm_jobs j
join clients c on c.id = j.client_id and c.deleted_at is null
left join crm_crews cw on cw.id = j.crew_id
left join profiles sr on sr.id = j.sales_rep_id
where j.deleted_at is null;

create or replace view rpt_job_visits
with (security_invoker = on) as
select
  v.id,
  v.scheduled_date,
  v.completed_at,
  v.status,
  v.sub_status,
  c.display_name as client_name,
  (select string_agg(js.service_name, ', ' order by js.sort_order)
     from crm_job_services js where js.job_id = j.id) as service_names,
  cw.name as crew_name,
  sr.name as sales_rep,
  coalesce(v.men_count, 1) as men_count,
  coalesce(v.budgeted_hours, j.budgeted_hours) as budgeted_hours,
  calc.actual_hours,
  round(calc.actual_hours * coalesce(v.men_count, 1), 2) as man_hours,
  coalesce(v.rate_cents, j.rate_cents) as rate_cents,
  calc.revenue_cents,
  v.actual_labor_cost_cents,
  case
    when calc.actual_hours * coalesce(v.men_count, 1) > 0
    then round(calc.revenue_cents / (calc.actual_hours * coalesce(v.men_count, 1)))::int
  end as rev_per_man_hr_cents,
  round(coalesce(v.budgeted_hours, j.budgeted_hours, 0) - coalesce(calc.actual_hours, 0), 2) as variance_hours,
  j.service_city,
  j.service_zip,
  v.skip_reason,
  v.clocked_in_at,
  v.clocked_out_at
from crm_job_visits v
join crm_jobs j on j.id = v.job_id and j.deleted_at is null
join clients c on c.id = coalesce(v.client_id, j.client_id) and c.deleted_at is null
left join crm_crews cw on cw.id = coalesce(v.crew_id, j.crew_id)
left join profiles sr on sr.id = j.sales_rep_id
cross join lateral (
  select
    coalesce(
      v.actual_hours,
      case when v.clocked_in_at is not null and v.clocked_out_at is not null
        then round((extract(epoch from (v.clocked_out_at - v.clocked_in_at)) / 3600.0)::numeric, 2)
      end
    ) as actual_hours,
    (coalesce(v.rate_cents, j.rate_cents, 0) * coalesce(nullif(v.qty, 0), 1))::int as revenue_cents
) calc
where v.deleted_at is null;

create or replace view rpt_invoices
with (security_invoker = on) as
select
  i.id,
  i.invoice_number,
  i.invoice_date,
  i.due_date,
  i.status,
  c.display_name as client_name,
  sr.name as sales_rep,
  i.description,
  i.subtotal_cents,
  i.discount_cents,
  i.tax_cents,
  i.total_cents,
  i.amount_paid_cents,
  i.balance_cents,
  i.terms,
  i.preferred_payment_method as payment_method,
  i.service_address,
  i.po_number,
  (i.contract_id is not null) as under_contract,
  c.billing_city,
  c.billing_zip,
  case when i.balance_cents > 0 and i.due_date is not null
    then greatest(0, current_date - i.due_date) else 0 end as days_overdue,
  i.created_at
from crm_invoices i
join clients c on c.id = i.client_id and c.deleted_at is null
left join profiles sr on sr.id = i.sales_rep_id
where i.deleted_at is null;

create or replace view rpt_contracts
with (security_invoker = on) as
select
  k.id,
  k.title,
  c.display_name as client_name,
  k.status,
  k.start_date,
  k.end_date,
  k.monthly_amount_cents,
  k.billing_frequency,
  k.billing_day_of_month,
  k.is_active,
  k.auto_generate,
  k.last_billed_date,
  sr.name as sales_rep,
  k.source,
  k.created_at
from crm_contracts k
join clients c on c.id = k.client_id and c.deleted_at is null
left join profiles sr on sr.id = k.sales_rep_id
where k.deleted_at is null;
