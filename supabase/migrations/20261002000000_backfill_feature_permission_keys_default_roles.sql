-- Estimates, Contracts, Sales Campaigns, Sales Meetings, Requisitions, Snow
-- Dispatch, Snow Invoicing, Services, Packages and Document Templates got real
-- permission keys in 1d861fbd, but the seeded default roles were never given
-- them. can() and has_settings_permission() both resolve a MISSING key to
-- false, so every non-admin login lost these screens: "Owner" (292 keys) and
-- "Sales / Account Mgr" couldn't open Estimates at all. Found while using the
-- sandbox as each default role for a day.
--
-- Additive (permissions || ...) so orgs' customised roles aren't clobbered, and
-- scoped to the seeded role names by what that job does. Custom roles are left
-- alone; an admin grants those in Settings > Roles. Admins bypass every check,
-- so they are unaffected either way.

-- Everything: Owner, Operations Manager.
update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
  'estimate_list', true, 'estimate_add', true, 'estimate_edit', true, 'estimate_send', true,
  'contract_list', true, 'contract_add', true, 'contract_edit', true, 'contract_delete', true, 'contract_create_invoices', true,
  'campaign_list', true, 'campaign_add', true, 'campaign_edit', true, 'campaign_delete', true, 'campaign_send', true,
  'sales_meeting_list', true, 'sales_meeting_add', true, 'sales_meeting_edit', true,
  'requisition_list', true, 'requisition_add', true, 'requisition_edit', true, 'requisition_delete', true,
  'snow_dispatch_view', true, 'snow_dispatch_manage', true,
  'snow_invoicing_view', true, 'snow_invoicing_generate', true,
  'service_list', true, 'service_add', true, 'service_edit', true, 'service_delete', true, 'service_bulk_price', true,
  'package_list', true, 'package_add', true, 'package_edit', true, 'package_delete', true,
  'document_template_list', true, 'document_template_add', true, 'document_template_edit', true, 'document_template_delete', true
)
where deleted_at is null and name in ('Owner', 'Operations Manager');

-- Office Admin: runs the office, but the Services/Packages catalogs drive
-- billing math org-wide, so those stay view-only.
update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
  'estimate_list', true, 'estimate_add', true, 'estimate_edit', true, 'estimate_send', true,
  'contract_list', true, 'contract_add', true, 'contract_edit', true, 'contract_create_invoices', true,
  'campaign_list', true, 'campaign_add', true, 'campaign_edit', true, 'campaign_send', true,
  'sales_meeting_list', true, 'sales_meeting_add', true, 'sales_meeting_edit', true,
  'requisition_list', true, 'requisition_add', true, 'requisition_edit', true,
  'snow_dispatch_view', true, 'snow_dispatch_manage', true,
  'snow_invoicing_view', true, 'snow_invoicing_generate', true,
  'service_list', true, 'package_list', true,
  'document_template_list', true, 'document_template_add', true, 'document_template_edit', true
)
where deleted_at is null and name = 'Office Admin';

-- Sales / Account Mgr: estimates, contracts, campaigns and meetings are the job.
update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
  'estimate_list', true, 'estimate_add', true, 'estimate_edit', true, 'estimate_send', true,
  'contract_list', true, 'contract_add', true, 'contract_edit', true,
  'campaign_list', true, 'campaign_add', true, 'campaign_edit', true, 'campaign_send', true,
  'sales_meeting_list', true, 'sales_meeting_add', true, 'sales_meeting_edit', true,
  'service_list', true, 'package_list', true,
  'document_template_list', true
)
where deleted_at is null and name = 'Sales / Account Mgr';

-- Accounting: contracts and snow billing feed invoicing; estimates are read-only.
update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
  'estimate_list', true,
  'contract_list', true, 'contract_add', true, 'contract_edit', true, 'contract_create_invoices', true,
  'snow_invoicing_view', true, 'snow_invoicing_generate', true,
  'requisition_list', true
)
where deleted_at is null and name = 'Accounting';

-- Scheduler: snow dispatch plus the service/package catalogs they schedule from.
update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
  'snow_dispatch_view', true, 'snow_dispatch_manage', true,
  'service_list', true, 'package_list', true
)
where deleted_at is null and name = 'Scheduler';

-- Customer Support Rep: looks up estimates and contracts to answer clients.
update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
  'estimate_list', true,
  'contract_list', true
)
where deleted_at is null and name = 'Customer Support Rep';

-- Crew Leader and Fertilizer Tech work from the crew app; nothing to add.
