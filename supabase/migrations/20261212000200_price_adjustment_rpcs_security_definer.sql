-- Price adjustment runs: let a role with pricing_adjustment_run finish a run
-- that touches packages without also holding package_edit.
--
-- crm_apply_price_adjustment / crm_revert_price_adjustment were SECURITY INVOKER
-- and UPDATE crm_packages.monthly_amount_cents and
-- crm_package_services.default_rate_cents. Since #406 those tables'
-- direct-write guards require package_edit, so a custom role holding only
-- pricing_adjustment_run had the whole run (or its undo) aborted with "You do
-- not have permission to edit packages".
--
-- Both functions already state has_settings_permission('pricing_adjustment_run')
-- as their first statement and scope every read and write to my_org_id(), so
-- running them as the owner (exempt from the direct-write guards, which only
-- police authenticated/anon sessions) keeps the same authorization boundary.
-- search_path is pinned because a definer function must not resolve names
-- through the caller's path.

alter function public.crm_apply_price_adjustment(text, text, numeric, text, jsonb, text[], text, jsonb)
  security definer
  set search_path to 'public';

alter function public.crm_revert_price_adjustment(uuid)
  security definer
  set search_path to 'public';

-- Same posture as before: signed-in users only, never anon.
revoke execute on function public.crm_apply_price_adjustment(text, text, numeric, text, jsonb, text[], text, jsonb) from public, anon;
grant  execute on function public.crm_apply_price_adjustment(text, text, numeric, text, jsonb, text[], text, jsonb) to authenticated;
revoke execute on function public.crm_revert_price_adjustment(uuid) from public, anon;
grant  execute on function public.crm_revert_price_adjustment(uuid) to authenticated;
