"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Generic route guard: blocks direct navigation to restrictedPaths unless
 * `allowed` is true. Unlike InternalOnlyGuard (hardcoded to the Twins-only
 * org check), the access check is passed in — e.g. useHasDrivingScoreAccess.
 */
export function FeatureGuard({
  restrictedPaths,
  allowed,
  isLoading,
  children,
}: {
  restrictedPaths: string[];
  allowed: boolean;
  isLoading: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isRestrictedRoute = restrictedPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );

  if (isRestrictedRoute && !isLoading && !allowed) {
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
