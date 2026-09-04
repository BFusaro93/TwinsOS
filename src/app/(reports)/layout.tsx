"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ReportsSidebar, DASHBOARDS_NAV } from "@/components/shared/ReportsSidebar";
import { TopBar } from "@/components/shared/TopBar";
import { RealtimeSync } from "@/components/shared/RealtimeSync";
import { SettingsLoader } from "@/components/shared/SettingsLoader";
import { InternalOnlyGuard } from "@/components/shared/InternalOnlyGuard";
import { useUIStore, useCurrentUserStore } from "@/stores";
import { usePageTitle } from "@/lib/hooks/use-page-title";

const INTERNAL_ONLY_PATHS = ["/dashboards/financials", "/dashboards/avb", "/dashboards/safety", "/dashboards/crm"];

/** Built-in office dashboards crew logins must not reach by URL — the
 *  sidebar/overview already hide the links (hideFromCrew). Custom dashboards
 *  aren't listed here: /api/crm/dashboards/[id] enforces visible_to_crew. */
const CREW_BLOCKED_PATHS = ["/dashboards/equipt", "/dashboards/myday", "/dashboards/landscapt-reports", "/dashboards/kpis"];

function CrewBlockedGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser } = useCurrentUserStore();
  const blocked =
    currentUser.role === "crew" &&
    CREW_BLOCKED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!blocked) return <>{children}</>;
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Not available</h1>
        <p className="mt-2 text-sm text-slate-500">This dashboard isn&apos;t available to crew logins.</p>
      </div>
    </div>
  );
}

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const pathname = usePathname();

  usePageTitle(pathname, [{ items: DASHBOARDS_NAV }], "Landscapt");

  // Auto-close mobile sidebar drawer on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <RealtimeSync />
      <SettingsLoader />

      {/* Desktop sidebar */}
      <div className="hidden h-full md:flex">
        <ReportsSidebar />
      </div>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 h-full w-[260px]">
            <ReportsSidebar />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <InternalOnlyGuard restrictedPaths={INTERNAL_ONLY_PATHS}>
            <CrewBlockedGuard>{children}</CrewBlockedGuard>
          </InternalOnlyGuard>
        </main>
      </div>
    </div>
  );
}
