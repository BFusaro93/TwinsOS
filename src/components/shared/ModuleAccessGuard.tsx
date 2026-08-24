"use client";

import type { ReactNode } from "react";
import { useModuleAccess } from "@/lib/hooks/use-module-access";
import type { PlatformModule } from "@/lib/stripe/plans";

/** Blocks a dashboard embedded outside its own module's layout (e.g. under /dashboards) when the org's plan doesn't include that module. */
export function ModuleAccessGuard({
  module,
  children,
}: {
  module: PlatformModule;
  children: ReactNode;
}) {
  const { allowed, isLoading } = useModuleAccess(module);

  if (!isLoading && !allowed) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Not available</h1>
          <p className="mt-2 text-sm text-slate-500">This feature isn&apos;t included in your plan.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
