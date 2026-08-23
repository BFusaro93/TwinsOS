"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Permissions } from "@/types/crm-roles";

interface PermissionsResult {
  permissions: Permissions;
  can: (key: string) => boolean;
  isAdmin: boolean;
  isLoading: boolean;
  roleId: string | null;
  roleName: string | null;
}

async function fetchUserPermissions(): Promise<{
  permissions: Permissions;
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  profileRole: string | null;
  hasEmployeeLink: boolean;
}> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { permissions: {}, isAdmin: false, roleId: null, roleName: null, profileRole: null, hasEmployeeLink: false };
  }

  // Check if user is org admin via profile role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  // Get employee record linked to this auth user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: employee } = await (supabase as any)
    .from("crm_employees")
    .select("crm_role_id, crm_roles(name, permissions, deleted_at)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = employee?.crm_roles as any;
  // A soft-deleted role (crm_roles.deleted_at set) must stop granting access —
  // the join above doesn't filter deleted_at itself, so treat it as unassigned.
  if (!employee?.crm_role_id || !role || role.deleted_at) {
    return { permissions: {}, isAdmin, roleId: null, roleName: null, profileRole: profile?.role ?? null, hasEmployeeLink: !!employee };
  }

  return {
    permissions: role.permissions ?? {},
    isAdmin,
    roleId: employee.crm_role_id,
    roleName: role.name ?? null,
    profileRole: profile?.role ?? null,
    hasEmployeeLink: true,
  };
}

export function usePermissions(): PermissionsResult {
  const { data, isLoading } = useQuery({
    queryKey: ["crm-permissions"],
    queryFn: fetchUserPermissions,
    staleTime: 5 * 60 * 1000, // cache 5 min — permissions don't change often
  });

  const permissions = data?.permissions ?? {};
  const isAdmin = data?.isAdmin ?? false;

  // Admins bypass all permission checks
  function can(key: string): boolean {
    if (isAdmin) return true;
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
  const { data, isLoading } = useQuery({
    queryKey: ["crm-permissions"],
    queryFn: fetchUserPermissions,
    staleTime: 5 * 60 * 1000,
  });
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
  const { data, isLoading } = useQuery({
    queryKey: ["crm-permissions"],
    queryFn: fetchUserPermissions,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) return { allowed: true, isLoading: true }; // avoid a flash of the denied screen while loading

  if (data.isAdmin) return { allowed: true, isLoading: false };
  if (data.profileRole === "crew") return { allowed: pathname.startsWith("/crm/crew"), isLoading: false };
  return { allowed: !!data.roleId, isLoading: false };
}
