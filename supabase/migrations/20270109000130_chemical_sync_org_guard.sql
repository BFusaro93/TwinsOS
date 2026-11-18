-- Bug sweep round 15 (area 1): org guard on sync_chemical_application_inventory(p_app_id).
--
-- WHAT / WHY
--   The function is SECURITY DEFINER and granted to `authenticated` (its only callers are the
--   SECURITY INVOKER triggers trg_chemical_application_inventory / trg_chemical_visit_inventory,
--   which run as the writing user, so EXECUTE can't simply be revoked). With a known
--   application id any login could resync — i.e. move — another org's product stock.
--   It now returns without doing anything when _org_mismatch(application.org_id) is true.
--   _org_mismatch() is false for the service role and for in-database calls with no JWT, so
--   service-role crew routes, cron and trigger paths keep working; impersonating staff match
--   via my_org_id(). Body otherwise identical to the current TEST definition.
--
-- PROD: apply BEFORE or AFTER the code deploy (DB-only). No pre-check needed.

CREATE OR REPLACE FUNCTION public.sync_chemical_application_inventory(p_app_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a public.crm_chemical_applications%rowtype;
  v_status text;
  v_inventory boolean;
  v_on_hand numeric;
  v_desired numeric := 0;
  v_have numeric;
  v_delta numeric;
  v_rem numeric;
  v_total numeric;
  v_step numeric;
  v_short numeric;
begin
  select * into a from public.crm_chemical_applications where id = p_app_id;
  if not found then
    return;
  end if;

  -- Only the application's own org (or the service role / an in-database trigger
  -- or cron call with no JWT) may resync its stock. SECURITY DEFINER + a
  -- caller-supplied id let any login move another org's inventory. Returns quietly
  -- rather than raising: stock bookkeeping never blocks the write that fired it.
  if public._org_mismatch(a.org_id) then
    return;
  end if;

  select status into v_status from public.crm_job_visits where id = a.visit_id and deleted_at is null;
  select is_inventory into v_inventory
  from public.product_items where id = a.product_id and deleted_at is null;

  if a.deleted_at is null and a.used and v_status = 'completed' and coalesce(v_inventory, false)
     and (not a.preloaded or a.confirmed_at is not null) then
    v_desired := coalesce(public.chem_amount_in_stock_unit(a.product_id, a.chemical_amount, a.unit_of_measure_id), 0);
  end if;

  v_have := coalesce(a.inventory_adjusted_qty, 0);
  v_delta := v_desired - v_have;
  if v_delta = 0 then
    return;
  end if;

  begin
    -- One product's stock and remainder move together.
    select quantity_on_hand into v_on_hand
    from public.product_items where id = a.product_id and deleted_at is null
    for update;

    select remainder into v_rem from public.crm_chemical_stock_remainders where product_id = a.product_id;
    v_total := coalesce(v_rem, 0) + v_delta;
    v_step := round(v_total, 2);
    v_short := 0;
    -- Never below zero on hand: the part that isn't in stock isn't accounted, so
    -- the next change to the application retries it (as before).
    if v_step > 0 and v_step > greatest(coalesce(v_on_hand, 0), 0) then
      v_short := v_step - greatest(coalesce(v_on_hand, 0), 0);
      v_step := v_step - v_short;
    end if;

    if v_step <> 0 then
      perform public.adjust_product_item_quantity(
        a.org_id, a.product_id, -v_step,
        case when v_delta > 0 then 'chemical applied on job' else 'chemical application reopened or changed' end
      );
    end if;

    insert into public.crm_chemical_stock_remainders (org_id, product_id, remainder)
    values (a.org_id, a.product_id, v_total - v_short - v_step)
    on conflict (product_id) do update set remainder = excluded.remainder, updated_at = now();

    update public.crm_chemical_applications
    set inventory_adjusted_qty = nullif(v_have + v_delta - v_short, 0)
    where id = a.id;
  exception when others then
    -- Stock bookkeeping must never block the visit/application write that
    -- triggered it (e.g. a service-role call with no end-user for the audit
    -- trail). Nothing above is kept, so the next change retries.
    raise warning 'sync_chemical_application_inventory(%): %', p_app_id, sqlerrm;
  end;
end;
$function$;

revoke all on function public.sync_chemical_application_inventory(uuid) from public, anon;
grant execute on function public.sync_chemical_application_inventory(uuid) to authenticated, service_role;
