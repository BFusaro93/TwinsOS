"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/hooks/use-current-profile";
import type { Permissions } from "@/types/crm-roles";

/**
 * crm_roles permission keys that grant a WRITE (create / edit / delete /
 * send / run). Viewer and requestor app roles (profiles.role) are read-only
 * in the database for every table these touch, whatever their Landscapt CRM
 * role says, so can() reports them false for those logins. Keys that mix
 * viewing with writing (tickets_view_modify, forms_view_submit) are left
 * alone so the screens stay viewable; the DB still refuses the writes.
 */
const WRITE_PERMISSION_KEYS = new Set<string>([
  "manage_report_center", "social_media_edit", "allow_roles_access", "quickbooks_resync",
  "bulk_edit_products", "imports",
  "client_activate_deactivate", "client_add", "client_allow_edit", "client_allow_delete",
  "client_bulk_edit", "client_bulk_create", "client_add_contract", "client_reset_portal_password",
  "lead_allow_edit", "lead_allow_delete", "lead_bulk_create", "lead_add", "lead_convert_close",
  "estimate_add", "estimate_edit", "estimate_send",
  "contract_add", "contract_edit", "contract_delete", "contract_create_invoices",
  "campaign_add", "campaign_edit", "campaign_delete", "campaign_send",
  "sales_meeting_add", "sales_meeting_edit",
  "tickets_add_notes", "tickets_add_calls", "tags_create_tag",
  "automation_create_modify", "automation_stop", "automation_add_tags",
  "forms_edit", "email_activity_send", "sms_send",
  "document_template_add", "document_template_edit", "document_template_delete",
  "sched_add_modify_projects", "snow_dispatch_manage",
  "job_add", "job_cancel", "job_add_remove_custom_package_line_items",
  "service_add", "service_edit", "service_delete", "service_bulk_price", "pricing_adjustment_run",
  "package_add", "package_edit", "package_delete",
  "chem_add_edit_usage", "chem_send_application_notice", "chem_create_uom",
  "chem_create_application_method", "chem_create_target",
  "emp_manage", "emp_add", "emp_edit", "emp_add_remove_tag",
  "requisition_add", "requisition_edit", "requisition_delete",
  "snow_invoicing_generate",
  "acct_add_modify_invoices", "acct_send_invoices", "acct_send_statements",
  "acct_add_modify_payments", "acct_delete_card_payments", "acct_delete_ach_payments",
  "acct_process_cc_refunds_voids", "acct_add_modify_credits", "acct_qb_reconciliation",
  "acct_add_modify_purchase_orders",
]);

/** Requestors may still draft (and edit / delete their own draft) requisitions. */
const REQUESTOR_ALLOWED_WRITE_KEYS = new Set<string>([
  "requisition_add", "requisition_edit", "requisition_delete",
]);

function isRoleBlockedWrite(profileRole: string | null | undefined, key: string): boolean {
  if (!WRITE_PERMISSION_KEYS.has(key)) return false;
  if (profileRole === "viewer") return true;
  if (profileRole === "requestor") return !REQUESTOR_ALLOWED_WRITE_KEYS.has(key);
  return false;
}

interface PermissionsResult {
  permissions: Permissions;
  can: (key: string) => boolean;
  isAdmin: boolean;
  isLoading: boolean;
  roleId: string | null;
  roleName: string | null;
}

async function fetchUserPermissions(queryClient: QueryClient): Promise<{
  permissions: Permissions;
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  profileRole: string | null;
  hasEmployeeLink: boolean;
}> {
  const profile = await fetchCurrentProfile(queryClient);
  if (!profile) {
    return { permissions: {}, isAdmin: false, roleId: null, roleName: null, profileRole: null, hasEmployeeLink: false };
  }

  const isAdmin = profile.role === "admin";

  const supabase = createClient();
  // Get employee record linked to this auth user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: employee, error: employeeError } = await (supabase as any)
    .from("crm_employees")
    .select("crm_role_id, crm_roles(name, permissions, deleted_at)")
    .eq("user_id", profile.userId)
    .is("deleted_at", null)
    .maybeSingle();

  // Fail CLOSED: if the role can't be read, the login has no role
  // permissions (admins still pass every check via isAdmin). Previously the
  // error was ignored and the null result read as "no role", which the
  // dashboard gate treated as full access.
  if (employeeError) {
    return { permissions: {}, isAdmin, roleId: null, roleName: null, profileRole: profile.role, hasEmployeeLink: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = employee?.crm_roles as any;
  // A soft-deleted role (crm_roles.deleted_at set) must stop granting access —
  // the join above doesn't filter deleted_at itself, so treat it as unassigned.
  if (!employee?.crm_role_id || !role || role.deleted_at) {
    return { permissions: {}, isAdmin, roleId: null, roleName: null, profileRole: profile.role, hasEmployeeLink: !!employee };
  }

  return {
    permissions: role.permissions ?? {},
    isAdmin,
    roleId: employee.crm_role_id,
    roleName: role.name ?? null,
    profileRole: profile.role,
    hasEmployeeLink: true,
  };
}

/**
 * Shared ["crm-permissions"] query. Like every useQuery here it reports
 * "still loading" until hydration finishes (see use-query.ts), so a
 * late-hydrating Suspense boundary (e.g. TicketsList) never renders
 * permission-gated UI the server HTML didn't have.
 */
function usePermissionsQuery() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["crm-permissions"],
    queryFn: () => fetchUserPermissions(queryClient),
    staleTime: 5 * 60 * 1000, // cache 5 min — permissions don't change often
  });
}

export function usePermissions(): PermissionsResult {
  const { data, isLoading } = usePermissionsQuery();

  const permissions = data?.permissions ?? {};
  const isAdmin = data?.isAdmin ?? false;
  const profileRole = data?.profileRole ?? null;

  // Admins bypass all permission checks
  function can(key: string): boolean {
    if (isAdmin) return true;
    if (isRoleBlockedWrite(profileRole, key)) return false;
    return !!permissions[key];
  }

  return {
    permissions,
    can,
    isAdmin,
    isLoading,
    roleId: data?.roleId ?? null,
    roleName: data?.roleName ?? null,
  };
}

/**
 * True once we know (post-load) that this login is a shared crew field-clock-in
 * account (profiles.role === 'crew') rather than a real seat — used to keep
 * crew logins confined to /crm/crew and out of the PO/CMMS dashboard shell.
 */
export function useIsCrewOnly(): { isCrewOnly: boolean; isLoading: boolean } {
  const { data, isLoading } = usePermissionsQuery();
  return { isCrewOnly: data?.profileRole === "crew", isLoading: isLoading || !data };
}

/**
 * Gates access to the CRM module itself (not a specific permission within it).
 * Org admins always get in. Crew accounts (profiles.role === 'crew') only get
 * into their own /crm/crew surface — that's a shared field-clock-in login, not
 * a real CRM seat. Everyone else needs an active crm_employees record linked
 * to their login (crm_role_id set) — being able to log in at all does not,
 * by itself, grant CRM access.
 */
export function useCrmAccess(pathname: string): { allowed: boolean; isLoading: boolean } {
  const { data, isLoading, isError } = usePermissionsQuery();

  // A failed permissions query is a denial, not an endless "loading" that
  // lets the page through.
  if (isError && !data) return { allowed: false, isLoading: false };
  if (isLoading || !data) return { allowed: true, isLoading: true }; // avoid a flash of the denied screen while loading

  if (data.isAdmin) return { allowed: true, isLoading: false };
  if (data.profileRole === "crew") return { allowed: pathname.startsWith("/crm/crew"), isLoading: false };
  return { allowed: !!data.roleId, isLoading: false };
}
