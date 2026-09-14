"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useIsInternalOrg } from "@/lib/hooks/use-internal-org";

/**
 * Blocks direct navigation to routes that are only meant for Twins Lawn
 * Service's own org (see useIsInternalOrg) — the sidebar already hides the
 * nav links, this stops URL-bar access for every other org.
 */
export function InternalOnlyGuard({
  restrictedPaths,
  children,
}: {
  restrictedPaths: string[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { isInternalOrg, isLoading } = useIsInternalOrg();
  const isRestrictedRoute = restrictedPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );

  if (isRestrictedRoute && !isLoading && !isInternalOrg) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Not available</h1>
          <p className="mt-2 text-sm text-slate-500">This feature isn&apos;t included in your plan.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
