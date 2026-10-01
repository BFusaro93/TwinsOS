-- ============================================================
-- Project labor rates: freeze completed projects, and make "apply the new org
-- rate to existing projects" an explicit action.
--
-- New projects already snapshot the org's break-even / LLR into
-- projects.labor_rate_cents / burdened_rate_cents at creation (June 2026).
-- Two gaps remained:
--   1. Projects that predate the snapshot have NULL rates and fall back to the
--      LIVE org rate, so editing the org rate silently rewrote their profit.
--      On PROD this was 8 completed projects.
--   2. Nothing stopped a completed project's rates being edited later.
--
-- This migration
--   * backfills NULL rates from the org's current rates, so those projects
--     keep showing exactly what they show today and stop floating;
--   * rejects rate edits on a completed project (reopen it first);
--   * adds apply_labor_rates_to_open_projects() for the opt-in "also update
--     open projects" step offered when an org rate is saved. It never touches
--     complete or canceled projects.
-- ============================================================

-- 1. Backfill. Runs BEFORE the lock trigger exists, and leaves audit on so
--    each frozen rate shows in the project's history.
UPDATE public.projects p
   SET labor_rate_cents = coalesce(
         p.labor_rate_cents,
         (o.customizations ->> 'breakevenLaborRateCents')::integer
       ),
       burdened_rate_cents = coalesce(
         p.burdened_rate_cents,
         (o.customizations ->> 'burdenedLaborRateCents')::integer
       )
  FROM public.organizations o
 WHERE o.id = p.org_id
   AND p.deleted_at IS NULL
   AND (p.labor_rate_cents IS NULL OR p.burdened_rate_cents IS NULL)
   AND (
     (o.customizations ->> 'breakevenLaborRateCents') ~ '^\d+$'
     OR (o.customizations ->> 'burdenedLaborRateCents') ~ '^\d+$'
   );

-- 2. Lock completed projects' rates.
CREATE OR REPLACE FUNCTION public.fn_projects_lock_completed_rates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  -- Reopening (status leaving 'complete') and editing in the same statement is
  -- allowed; a project that stays complete cannot have its rates changed.
  if OLD.status = 'complete' and NEW.status = 'complete'
     and (NEW.labor_rate_cents is distinct from OLD.labor_rate_cents
          or NEW.burdened_rate_cents is distinct from OLD.burdened_rate_cents) then
    raise exception 'Labor rates are locked on completed projects. Reopen the project to change them.'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS trg_projects_lock_completed_rates ON public.projects;
CREATE TRIGGER trg_projects_lock_completed_rates
  BEFORE UPDATE OF labor_rate_cents, burdened_rate_cents, status ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.fn_projects_lock_completed_rates();

-- 3. Opt-in bulk apply to open projects. SECURITY INVOKER: projects RLS and the
--    lock trigger above both still apply. Role-gated to match who may change
--    the org rates (and the job-costing scenarios) in the first place.
CREATE OR REPLACE FUNCTION public.apply_labor_rates_to_open_projects(
  p_labor_rate_cents integer,
  p_burdened_rate_cents integer,
  p_dry_run boolean DEFAULT false
) RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid := public.my_org_id();
  v_count integer;
begin
  if v_org is null or public.is_client_portal_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not (public.my_role() in ('admin', 'manager')
          or public.has_settings_permission('accounting_settings')
          or public.has_settings_permission('company_settings')) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_labor_rate_cents is null or p_labor_rate_cents < 0
     or p_burdened_rate_cents is null or p_burdened_rate_cents < 0 then
    raise exception 'Rates must be zero or greater' using errcode = '22023';
  end if;

  if p_dry_run then
    select count(*) into v_count
      from projects
     where org_id = v_org and deleted_at is null
       and status in ('sold', 'scheduled', 'in_progress', 'on_hold')
       and (labor_rate_cents is distinct from p_labor_rate_cents
            or burdened_rate_cents is distinct from p_burdened_rate_cents);
    return v_count;
  end if;

  update projects
     set labor_rate_cents = p_labor_rate_cents,
         burdened_rate_cents = p_burdened_rate_cents
   where org_id = v_org and deleted_at is null
     and status in ('sold', 'scheduled', 'in_progress', 'on_hold')
     and (labor_rate_cents is distinct from p_labor_rate_cents
          or burdened_rate_cents is distinct from p_burdened_rate_cents);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

REVOKE ALL ON FUNCTION public.apply_labor_rates_to_open_projects(integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_labor_rates_to_open_projects(integer, integer, boolean) TO authenticated;
