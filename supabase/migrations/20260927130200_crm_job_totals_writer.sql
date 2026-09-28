-- ============================================================
-- crm_jobs.service_total_cents / product_total_cents / total_cents had no
-- writer: only 11 of 63 PROD jobs were non-zero (seeded values), so Approved
-- Sales by Sales Rep, Sales by Date Sold, the KPI scorecard's revenue_sold and
-- the package reports all read zeros.
--
-- Pricing semantics mirror what the app shows as a job's value
-- (JobsList.jobRevenueCents and crm_recompute_job_rate_cents):
--   service_total = sum(round(qty * rate_cents)) over the job's INCLUDED
--                   service lines; a job with no service lines falls back to
--                   its own rate_cents.
--   product_total = sum(round(qty * unit_price_cents)) over live
--                   (deleted_at is null) product lines that are billable —
--                   status not in ('not_used', 'used_no_invoice').
--   total         = service_total + product_total + tax_cents.
--
-- Writers:
--   * BEFORE INSERT/UPDATE on crm_jobs (rate_cents, tax_cents or any total
--     column) recomputes the three columns, so they can't be hand-set out of
--     sync and the no-services rate fallback follows rate edits.
--   * AFTER triggers on crm_job_services / crm_job_products (insert, delete,
--     price/qty/status/soft-delete/job move) recompute the parent job.
-- fn_audit_log already skips these derived columns (20260927130100).
-- ============================================================

create or replace function public.crm_job_compute_totals(
  p_job_id uuid,
  p_rate_cents integer,
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
  select coalesce(sum(round(coalesce(s.qty, 1) * coalesce(s.rate_cents, 0)))::integer, 0),
         count(*)
    into service_total_cents, v_service_lines
    from crm_job_services s
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

-- SECURITY DEFINER over an arbitrary job id: callable only from the trigger
-- functions below (also definer), never directly by a tenant.
revoke all on function public.crm_job_compute_totals(uuid, integer) from public, anon, authenticated;
grant execute on function public.crm_job_compute_totals(uuid, integer) to service_role;

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
    from public.crm_job_compute_totals(NEW.id, NEW.rate_cents) t;

  NEW.service_total_cents := v_service;
  NEW.product_total_cents := v_product;
  NEW.total_cents         := v_service + v_product + coalesce(NEW.tax_cents, 0);
  return NEW;
end;
$$;

revoke all on function public.crm_jobs_set_totals() from public, anon, authenticated;

drop trigger if exists trg_crm_jobs_set_totals on public.crm_jobs;
create trigger trg_crm_jobs_set_totals
  before insert or update of rate_cents, tax_cents, service_total_cents, product_total_cents, total_cents
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
    from public.crm_job_compute_totals(p_job_id,
           (select rate_cents from crm_jobs where id = p_job_id)) t
   where j.id = p_job_id
     and (j.service_total_cents, j.product_total_cents, j.total_cents)
         is distinct from
         (t.service_total_cents, t.product_total_cents,
          t.service_total_cents + t.product_total_cents + coalesce(j.tax_cents, 0));
end;
$$;

revoke all on function public.crm_recompute_job_totals(uuid) from public, anon, authenticated;
grant execute on function public.crm_recompute_job_totals(uuid) to service_role;

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
  after insert or delete or update of qty, rate_cents, included, job_id
  on public.crm_job_services
  for each row execute function public.crm_job_lines_recompute_totals_trigger();

drop trigger if exists trg_crm_job_products_recompute_totals on public.crm_job_products;
create trigger trg_crm_job_products_recompute_totals
  after insert or delete or update of qty, unit_price_cents, status, deleted_at, job_id
  on public.crm_job_products
  for each row execute function public.crm_job_lines_recompute_totals_trigger();

-- ── backfill ─────────────────────────────────────────────────────────────
-- Only rows whose stored values differ. Jobs with nothing to price from (no
-- service lines, no product lines, null rate_cents) keep whatever they hold
-- today — on PROD that is one seeded job with a hand-set total.
do $$
begin
  perform set_config('app.suppress_audit', 'true', true);

  with calc as (
    select j.id,
           j.service_total_cents as cur_s, j.product_total_cents as cur_p, j.total_cents as cur_t,
           t.service_total_cents as new_s, t.product_total_cents as new_p,
           t.service_total_cents + t.product_total_cents + coalesce(j.tax_cents, 0) as new_t
      from public.crm_jobs j
      cross join lateral public.crm_job_compute_totals(j.id, j.rate_cents) t
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
