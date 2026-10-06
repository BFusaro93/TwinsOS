"use client";

import Link from "next/link";
import { useModuleAccess } from "@/lib/hooks/use-module-access";

// Only the cmms/* subtree is gated here, not the whole (dashboard) group —
// po/vendors/settings are shared with Landscapt-only orgs (see CLAUDE.md) and
// must stay reachable regardless of whether the Equipt module is on the plan.
export function CMMSGate({ children }: { children: React.ReactNode }) {
  const { allowed, isLoading } = useModuleAccess("equipt");

  if (!isLoading && !allowed) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Equipt isn&apos;t on your plan</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your current subscription doesn&apos;t include the Equipt (CMMS) module. Upgrade to Growth
            or Enterprise, or contact us, to turn it on.
          </p>
          <Link href="/settings?tab=subscription" className="mt-4 inline-block text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-400">
            Go to Subscription settings &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
