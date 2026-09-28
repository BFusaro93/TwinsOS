-- ============================================================
-- crm_jobs totals: recurring service lines are priced PER VISIT.
--
-- 20260927130200 computed service_total_cents = Σ qty × rate_cents, but a
-- recurring job converted from an estimate stores a per-visit rate
-- (ConvertToJobDialog.jobServicePricing: net ÷ (qty × visits)) and caps the
-- season with crm_job_services.max_visits. So Sales by Date Sold, Approved
-- Sales by Sales Rep and the KPI scorecard's revenue_sold (all read
-- crm_jobs.total_cents) showed ONE visit's price: PROD job 668f1daf read
-- $85.00 for a 26-visit, $2,210.00 mowing line; 049423ce $55.00 for $1,540.00.
--
-- A service line's contribution is now
--
--   round(qty × rate_cents × visits)
--
-- where visits =
--   1. crm_job_services.max_visits when set (the season the client bought —
--      the generator stops there, so this is exactly what gets billed);
--   2. else, on a RECURRING job whose line was converted from an estimate
--      line (estimate_line_item_id), that line's visit count — conversions
--      made before max_visits existed carry the per-visit rate but no cap
--      (both PROD jobs above);
--   3. else 1. An open-ended recurring job (no cap, not from an estimate,
--      e.g. an Add Job weekly mow with no end) has no finite "sold" value;
--      its total stays the per-visit price, as before. Deliberately NOT the
--      count of generated visits: that grows daily with the cron's rolling
--      horizon and would make "sales" drift after the sale.
--
-- One-time / project / waiting-list lines carry the whole line price on their
-- single visit (net ÷ qty), so rule 2 is recurring-only.
--
-- Known limitation: editing an estimate line's visit count AFTER conversion
-- does not re-fire this (the job's own lines are the source of truth; any
-- later edit to the job's services recomputes).
--
-- Same definitions otherwise as 20260927130200 (product lines unchanged).
-- The compute function gains p_job_type so the crm_jobs BEFORE trigger uses
-- NEW.job_type; the 2-arg version is dropped. The crm_jobs trigger now also
-- fires on job_type, and the service trigger on max_visits /
-- estimate_line_item_id.
-- ============================================================

create or replace function public.crm_job_compute_totals(
  p_job_id uuid,
  p_rate_cents integer,
  p_job_type text,
  out service_total_cents integer,
  out product_total_cents integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_service_lines integer;
begin
  select coalesce(sum(round(
           coalesce(s.qty, 1) * coalesce(s.rate_cents, 0)
           * greatest(1, coalesce(
               s.max_visits,
               case when p_job_type = 'recurring' then li.visits end,
               1))
         ))::integer, 0),
         count(*)
    into service_total_cents, v_service_lines
    from crm_job_services s
    left join estimate_line_items li on li.id = s.estimate_line_item_id
   where s.job_id = p_job_id
     and coalesce(s.included, true);

  if v_service_lines = 0 then
    service_total_cents := coalesce(p_rate_cents, 0);
  end if;

  select coalesce(sum(round(coalesce(p.qty, 0) * coalesce(p.unit_price_cents, 0)))::integer, 0)
    into product_total_cents
    from crm_job_products p
   where p.job_id = p_job_id
     and p.deleted_at is null
     and coalesce(p.status, 'pending') not in ('not_used', 'used_no_invoice');
end;
$$;

revoke all on function public.crm_job_compute_totals(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.crm_job_compute_totals(uuid, integer, text) to service_role;

-- ── crm_jobs: keep the columns derived ───────────────────────────────────
create or replace function public.crm_jobs_set_totals()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_service integer;
  v_product integer;
begin
  select t.service_total_cents, t.product_total_cents
    into v_service, v_product
    from public.crm_job_compute_totals(NEW.id, NEW.rate_cents, NEW.job_type) t;

  NEW.service_total_cents := v_service;
  NEW.product_total_cents := v_product;
  NEW.total_cents         := v_service + v_product + coalesce(NEW.tax_cents, 0);
  return NEW;
end;
$$;

revoke all on function public.crm_jobs_set_totals() from public, anon, authenticated;

drop trigger if exists trg_crm_jobs_set_totals on public.crm_jobs;
create trigger trg_crm_jobs_set_totals
  before insert or update of rate_cents, tax_cents, job_type, service_total_cents, product_total_cents, total_cents
  on public.crm_jobs
  for each row execute function public.crm_jobs_set_totals();

-- ── child lines: recompute the parent ────────────────────────────────────
create or replace function public.crm_recompute_job_totals(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_job_id is null then
    return;
  end if;
  -- Touching total_cents fires trg_crm_jobs_set_totals, which recomputes all
  -- three columns from the lines; the WHERE avoids no-op writes.
  update crm_jobs j
     set total_cents = t.service_total_cents + t.product_total_cents + coalesce(j.tax_cents, 0)
    from crm_jobs src
    cross join lateral public.crm_job_compute_totals(src.id, src.rate_cents, src.job_type) t
   where src.id = p_job_id
     and j.id = p_job_id
     and (j.service_total_cents, j.product_total_cents, j.total_cents)
         is distinct from
         (t.service_total_cents, t.product_total_cents,
          t.service_total_cents + t.product_total_cents + coalesce(j.tax_cents, 0));
end;
$$;

revoke all on function public.crm_recompute_job_totals(uuid) from public, anon, authenticated;
grant execute on function public.crm_recompute_job_totals(uuid) to service_role;

-- Unchanged from 20260927130200; re-stated so this file is self-contained.
create or replace function public.crm_job_lines_recompute_totals_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if TG_OP = 'DELETE' then
    perform public.crm_recompute_job_totals(OLD.job_id);
    return OLD;
  end if;

  perform public.crm_recompute_job_totals(NEW.job_id);
  if TG_OP = 'UPDATE' and OLD.job_id is distinct from NEW.job_id then
    perform public.crm_recompute_job_totals(OLD.job_id);
  end if;
  return NEW;
end;
$$;

revoke all on function public.crm_job_lines_recompute_totals_trigger() from public, anon, authenticated;

drop trigger if exists trg_crm_job_services_recompute_totals on public.crm_job_services;
create trigger trg_crm_job_services_recompute_totals
  after insert or delete or update of qty, rate_cents, included, max_visits, estimate_line_item_id, job_id
  on public.crm_job_services
  for each row execute function public.crm_job_lines_recompute_totals_trigger();

drop trigger if exists trg_crm_job_products_recompute_totals on public.crm_job_products;
create trigger trg_crm_job_products_recompute_totals
  after insert or delete or update of qty, unit_price_cents, status, deleted_at, job_id
  on public.crm_job_products
  for each row execute function public.crm_job_lines_recompute_totals_trigger();

-- The 2-arg version has no remaining callers (every caller above uses the
-- 3-arg form).
drop function if exists public.crm_job_compute_totals(uuid, integer);

-- ── backfill ─────────────────────────────────────────────────────────────
-- Same scope as 20260927130200: only rows whose stored values differ, and
-- only jobs with something to price from.
do $$
begin
  perform set_config('app.suppress_audit', 'true', true);

  with calc as (
    select j.id,
           j.service_total_cents as cur_s, j.product_total_cents as cur_p, j.total_cents as cur_t,
           t.service_total_cents as new_s, t.product_total_cents as new_p,
           t.service_total_cents + t.product_total_cents + coalesce(j.tax_cents, 0) as new_t
      from public.crm_jobs j
      cross join lateral public.crm_job_compute_totals(j.id, j.rate_cents, j.job_type) t
     where j.rate_cents is not null
        or exists (select 1 from public.crm_job_services s where s.job_id = j.id)
        or exists (select 1 from public.crm_job_products p where p.job_id = j.id and p.deleted_at is null)
  )
  update public.crm_jobs j
     set total_cents = c.new_t   -- fires trg_crm_jobs_set_totals, which sets all three
    from calc c
   where j.id = c.id
     and (c.cur_s, c.cur_p, c.cur_t) is distinct from (c.new_s, c.new_p, c.new_t);

  perform set_config('app.suppress_audit', 'false', true);
end;
$$;
