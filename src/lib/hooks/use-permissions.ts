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
}> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { permissions: {}, isAdmin: false, roleId: null, roleName: null };

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
    .select("crm_role_id, crm_roles(name, permissions)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!employee?.crm_role_id) {
    return { permissions: {}, isAdmin, roleId: null, roleName: null };
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    permissions: (employee.crm_roles as any)?.permissions ?? {},
    isAdmin,
    roleId: employee.crm_role_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    roleName: (employee.crm_roles as any)?.name ?? null,
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
