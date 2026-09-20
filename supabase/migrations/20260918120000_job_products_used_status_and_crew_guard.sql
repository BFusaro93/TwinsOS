-- Two fixes to the job-products status machine, in one migration because both
-- require replacing set_job_product_status and this repo has already lost an
-- in-DB permission check once by re-creating a function in a later migration
-- without restating an earlier guard (see 20260914010000, the price-run
-- permission regression). This file is the single, complete definition.
--
-- ── 1. New 'used' status: crew-recorded usage stays billable ────────────────
-- The crew app's "Mark Used" set 'used_no_invoice', and JobDetail.tsx builds
-- invoice lines from status = 'pending' only. So a crew confirming they used
-- 10 bags of mulch silently removed that material from the customer's invoice
-- — the office had no signal, because the row looked correctly resolved.
--
-- The status was overloaded: 'used_no_invoice' has to mean BOTH "used, we're
-- eating the cost" (a real, deliberate case) and "used, bill it" (what a crew
-- actually means). Splitting them:
--
--   pending          — called for, not yet resolved
--   used             — used, inventory decremented, STILL TO BE INVOICED  (new)
--   invoiced         — used and billed
--   used_no_invoice  — used, deliberately not billed
--   not_used         — not used at all
--
-- Inventory treats 'used' exactly like the other two used states, so the
-- pending -> used -> invoiced path decrements exactly once: the first hop is
-- the only not-used -> used transition, and used -> invoiced moves between two
-- used states, which this function already no-ops. Reopening (used -> pending)
-- still restores via inventory_adjusted_qty.
--
-- ── 2. Crew ownership guard ────────────────────────────────────────────────
-- crm_job_products was never covered by 20260910160000_crew_write_lockdown.sql
-- (that migration hardened crm_job_visits / crm_jobs / crm_job_services), and
-- has_crm_access() returns true for role 'crew'. This function is SECURITY
-- DEFINER and checked only org_id, so it runs as the owner and bypasses RLS
-- entirely — meaning a crew JWT plus the anon key could call it against ANY
-- job product in the org: decrementing stock for a product on someone else's
-- job, or reopening an already-invoiced row.
--
-- A crew may now only resolve materials on a job its own crew is actually
-- serving. Non-crew roles are unaffected. Note the effective-crew fallback:
-- crm_job_visits.crew_id is frequently NULL in this codebase and the job's crew
-- is the real assignment, so both are checked (same rule the app calls
-- effectiveCrewId).
alter table public.crm_job_products
  drop constraint if exists crm_job_products_status_check;

alter table public.crm_job_products
  add constraint crm_job_products_status_check
  check (status = any (array['pending', 'used', 'invoiced', 'used_no_invoice', 'not_used']));

create or replace function public.set_job_product_status(p_job_product_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_org_id       uuid;
  v_job_id       uuid;
  v_product_id   uuid;
  v_qty          numeric;
  v_old_status   text;
  v_restore      numeric;
  v_is_inventory boolean;
  v_old_used     boolean;
  v_new_used     boolean;
BEGIN
  IF p_new_status NOT IN ('pending', 'used', 'invoiced', 'used_no_invoice', 'not_used') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  SELECT org_id, job_id, product_id, qty, status, inventory_adjusted_qty
    INTO v_org_id, v_job_id, v_product_id, v_qty, v_old_status, v_restore
    FROM public.crm_job_products
    WHERE id = p_job_product_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job product not found';
  END IF;

  -- Unchanged from the original: a NULL my_org_id() (service role, which has no
  -- profile row) deliberately passes, because server-side flows such as goods
  -- receiving call this without an end-user session.
  IF v_org_id != public.my_org_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Crew accounts: only their own crew's jobs (see header note 2).
  IF coalesce(public.my_role(), '') = 'crew' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.crm_job_visits v
      JOIN public.crm_jobs j ON j.id = v.job_id
      WHERE v.job_id = v_job_id
        AND v.deleted_at IS NULL
        AND coalesce(v.crew_id, j.crew_id) IN (SELECT public.my_crew_ids())
    ) THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  v_old_used := v_old_status IN ('used', 'invoiced', 'used_no_invoice');
  v_new_used := p_new_status IN ('used', 'invoiced', 'used_no_invoice');

  IF v_product_id IS NOT NULL THEN
    SELECT is_inventory INTO v_is_inventory FROM public.product_items WHERE id = v_product_id;
  END IF;

  IF NOT v_old_used AND v_new_used AND COALESCE(v_is_inventory, false) THEN
    PERFORM public.adjust_product_item_quantity(v_org_id, v_product_id, -v_qty, 'used on job');
    UPDATE public.crm_job_products
    SET status = p_new_status, inventory_adjusted_qty = v_qty
    WHERE id = p_job_product_id;
  ELSIF v_old_used AND NOT v_new_used THEN
    IF v_restore IS NOT NULL AND v_restore != 0 AND v_product_id IS NOT NULL THEN
      PERFORM public.adjust_product_item_quantity(v_org_id, v_product_id, v_restore, 'job product reopened or cancelled');
    END IF;
    UPDATE public.crm_job_products
    SET status = p_new_status, inventory_adjusted_qty = NULL
    WHERE id = p_job_product_id;
  ELSE
    UPDATE public.crm_job_products
    SET status = p_new_status
    WHERE id = p_job_product_id;
  END IF;
END;
$function$;

revoke execute on function public.set_job_product_status(uuid, text) from public, anon;
grant execute on function public.set_job_product_status(uuid, text) to authenticated, service_role;
