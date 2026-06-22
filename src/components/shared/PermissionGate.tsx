"use client";

import { usePermissions } from "@/lib/hooks/use-permissions";

interface PermissionGateProps {
  permission: string;
  children: React.ReactNode;
  /** Instead of hiding, render children as disabled/muted. Use for buttons. */
  fallback?: React.ReactNode;
}

/**
 * Renders children only when the current user has the given permission key.
 * Org admins always pass.
 *
 * Usage:
 *   <PermissionGate permission="client_add">
 *     <Button>New Client</Button>
 *   </PermissionGate>
 *
 *   <PermissionGate permission="acct_add_modify_invoices" fallback={<Button disabled>New Invoice</Button>}>
 *     <Button>New Invoice</Button>
 *   </PermissionGate>
 */
export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const { can, isLoading } = usePermissions();
  if (isLoading) return null;
  if (!can(permission)) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * Hook version for conditional logic inside components.
 * Returns `can` directly so you can inline checks.
 *
 * const { can } = useGate();
 * if (!can("client_add")) return null;
 */
export { usePermissions as useGate };
