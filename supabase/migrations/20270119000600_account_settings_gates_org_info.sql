-- Wire the account_settings permission (Master Account Settings).
--
-- The permission was in the role editor but nothing checked it. It now opens
-- Master Account Settings -> Organization, Branding, Subscription and
-- Integrations (not Users or API keys, which stay admin-only). Two database
-- gates sit under the Organization / Branding tabs and needed to accept it:
--
--   1. settings_permission_update_org (row policy): now also passes for
--      account_settings. Re-stated in full (drop + create) so no other key
--      is lost; the (select my_org_id()) initplan form is kept.
--   2. guard_org_settings_columns (column gate): name / address / brand_color /
--      timezone accept company_settings OR account_settings. Tax rate, card
--      fee, ACH and costing still need accounting_settings; client defaults
--      still need crm_settings. Function re-stated in full from the live
--      definition with only the company-information block changed.

drop policy if exists "settings_permission_update_org" on public.organizations;
create policy "settings_permission_update_org" on public.organizations
  for update
  using (
    id = (select public.my_org_id())
    and (public.has_settings_permission('company_settings')
         or public.has_settings_permission('crm_settings')
         or public.has_settings_permission('accounting_settings')
         or public.has_settings_permission('account_settings'))
  );

create or replace function public.guard_org_settings_columns()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null
     or coalesce(auth.role(), '') = 'service_role'
     or pg_trigger_depth() > 1 then
    return new;
  end if;
  if (new.tax_rate_percent is distinct from old.tax_rate_percent
      or new.cost_method is distinct from old.cost_method
      or new.cc_processing_fee_enabled is distinct from old.cc_processing_fee_enabled
      or new.cc_processing_fee_bps is distinct from old.cc_processing_fee_bps
      or new.cc_processing_fee_threshold_cents is distinct from old.cc_processing_fee_threshold_cents
      or new.ach_payments_enabled is distinct from old.ach_payments_enabled
      or (new.customizations -> 'cc_processing_fee_mode') is distinct from (old.customizations -> 'cc_processing_fee_mode'))
     and not public.has_settings_permission('accounting_settings') then
    raise exception 'You need the Accounting Settings permission to change tax, card fee, ACH or costing settings.'
      using errcode = '42501';
  end if;
  if (new.account_number_prefix is distinct from old.account_number_prefix
      or new.account_number_next is distinct from old.account_number_next
      or new.account_number_suffix is distinct from old.account_number_suffix
      or new.default_billing_terms is distinct from old.default_billing_terms
      or new.default_invoice_frequency is distinct from old.default_invoice_frequency
      or new.default_invoice_delivery is distinct from old.default_invoice_delivery
      or new.crew_hide_pricing is distinct from old.crew_hide_pricing)
     and not public.has_settings_permission('crm_settings') then
    raise exception 'You need the CRM Settings permission to change client defaults or crew app settings.'
      using errcode = '42501';
  end if;
  if (new.name is distinct from old.name
      or new.address is distinct from old.address
      or new.brand_color is distinct from old.brand_color
      or new.timezone is distinct from old.timezone)
     and not (public.has_settings_permission('company_settings')
              or public.has_settings_permission('account_settings')) then
    raise exception 'You need the Company Settings or Account Settings permission to change company information.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_org_settings_columns() from public, anon, authenticated;
