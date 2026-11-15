-- Round 14 (access F3): organization settings columns are gated by the same
-- settings permission key as the Settings tab that edits them, and the card
-- surcharge is capped at 4%.
--
-- settings_permission_update_org lets a user with ANY of company_settings /
-- crm_settings / accounting_settings update the whole row, so the shipped
-- Office Admin role (company + CRM, no accounting) could change the card
-- surcharge, tax rate and ACH switch, which the UI keeps on the Accounting
-- tab. The policy stays (it is the row-level gate); this trigger adds the
-- column-level gate:
--
--   accounting_settings: tax_rate_percent, cost_method,
--     cc_processing_fee_enabled, cc_processing_fee_bps,
--     cc_processing_fee_threshold_cents, ach_payments_enabled,
--     customizations.cc_processing_fee_mode
--   crm_settings: account_number_prefix/next/suffix, default_billing_terms,
--     default_invoice_frequency, default_invoice_delivery, crew_hide_pricing
--     (Landscapt Settings → CRM → Client Defaults / Crew App)
--   company_settings: name, address, brand_color, timezone
--     (Landscapt Settings → General; Master Account is admin-only)
-- Everything else (portal_enabled, per_org_numbering, other customizations
-- keys) keeps the row policy's "any of the three keys" rule. Admins pass every
-- check (has_settings_permission). Service role, no-JWT database calls and
-- trigger cascades (e.g. set_client_defaults bumping account_number_next when
-- a client is created) are exempt.
--
-- cc_processing_fee_bps: CHECK 0..400 (owner decision: 4% cap).
-- PROD pre-check (must return 0 rows, else fix the value first):
--   select id, name, cc_processing_fee_bps from organizations
--    where cc_processing_fee_bps > 400 or cc_processing_fee_bps < 0;
--
-- Deploy order: BEFORE or AFTER the code deploy. The new Settings UI only adds
-- a 4% input limit; old code sending > 4% gets a constraint error instead of
-- saving, which is the intended behaviour.

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
     and not public.has_settings_permission('company_settings') then
    raise exception 'You need the Company Settings permission to change company information.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_org_settings_columns() from public, anon, authenticated;

drop trigger if exists trg_guard_org_settings_columns on public.organizations;
create trigger trg_guard_org_settings_columns
  before update on public.organizations
  for each row execute function public.guard_org_settings_columns();

alter table public.organizations drop constraint if exists organizations_cc_processing_fee_bps_check;
alter table public.organizations add constraint organizations_cc_processing_fee_bps_check
  check (cc_processing_fee_bps >= 0 and cc_processing_fee_bps <= 400);
