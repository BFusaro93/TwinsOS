-- D-12: taxability never survived the estimate -> job -> auto-invoice chain.
--
-- An estimate taxes its whole revenue base at estimates.tax_rate_bps (see
-- recalcEstimateTotals in src/lib/estimate-calc.ts — there is no per-line
-- taxable flag on estimate_line_items). When the estimate was converted to a
-- job, crm_job_services had no taxable column at all, so the visit-completion
-- auto-invoice (src/app/api/crm/visits/[visitId]/complete/route.ts) inserted
-- every crm_invoice_line_items row with the column default is_taxable=false
-- and tax_rate_bps=0 — an accepted $1,908 + $119.25 tax estimate produced a
-- $1,908 invoice with Tax $0.00.
--
-- crm_job_services.is_taxable snapshots, per job service, whether that
-- service should be billed with sales tax:
--   * useCreateJobsFromEstimate sets it explicitly from the estimate
--     (tax_rate_bps > 0  =>  every converted service is taxable).
--   * Any insert that leaves it NULL (the New Job dialog, QuickAdd, package /
--     recurring setup, imports) is defaulted by the trigger below from the
--     service catalog's crm_services.is_taxable — the same "default taxable
--     from the service" rule the invoice line-item picker already applies.
--
-- Column is nullable on purpose: NULL means "not yet resolved"; the BEFORE
-- INSERT trigger always resolves it, so persisted rows are never NULL.
-- Existing rows are intentionally NOT backfilled (per the bug report — data
-- fix is being handled manually); the auto-invoice falls back to the
-- catalog flag for rows where this is still NULL.
--
-- NOTE: apply to BOTH the prod and test Supabase projects.

alter table public.crm_job_services
  add column if not exists is_taxable boolean;

create or replace function public.default_crm_job_service_is_taxable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalog_taxable boolean;
begin
  if new.is_taxable is null then
    if new.service_id is not null then
      select is_taxable into v_catalog_taxable
        from public.crm_services
        where id = new.service_id;
    end if;
    new.is_taxable := coalesce(v_catalog_taxable, false);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_default_crm_job_service_is_taxable on public.crm_job_services;
create trigger trg_default_crm_job_service_is_taxable
  before insert on public.crm_job_services
  for each row execute function public.default_crm_job_service_is_taxable();
