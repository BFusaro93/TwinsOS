-- Per-employee monthly sales goals (dollar targets a sales rep is expected
-- to hit each month), entered on the employee's edit screen. Same JSONB
-- shape as crm_contracts.monthly_amounts (jan..dec cents, current year only
-- — no historical year dimension, matching that precedent).
alter table crm_employees
  add column if not exists sales_goals jsonb not null default '{}';

-- Joins each sales rep's current-month goal (read out of sales_goals by the
-- current month's key) against their actual invoiced revenue for the same
-- month, so a gauge panel can plot actual vs goal with the existing
-- kpiColumn/budgetColumn mechanism (one row per rep, no aggregation needed).
create or replace view rpt_sales_rep_month
with (security_invoker = on) as
select
  e.id as employee_id,
  e.org_id,
  nullif(trim(concat(e.first_name, ' ', e.last_name)), '') as sales_rep,
  coalesce(
    (e.sales_goals ->> lower(to_char(current_date, 'Mon')))::numeric,
    0
  )::bigint as goal_cents,
  coalesce(sum(i.total_cents) filter (
    where i.invoice_date >= date_trunc('month', current_date)::date
      and i.status <> 'void'
  ), 0) as actual_cents
from crm_employees e
left join crm_invoices i on i.sales_rep_id = e.id and i.deleted_at is null
where e.deleted_at is null and e.is_sales_rep = true
group by e.id, e.org_id, e.first_name, e.last_name, e.sales_goals;
