"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppSidebar } from "@/components/shared/AppSidebar";
import { TopBar } from "@/components/shared/TopBar";
import { RealtimeSync } from "@/components/shared/RealtimeSync";
import { SettingsLoader } from "@/components/shared/SettingsLoader";
import { useUIStore } from "@/stores";
import { useIsCrewOnly } from "@/lib/hooks/use-permissions";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const pathname = usePathname();
  const router = useRouter();
  const { isCrewOnly, isLoading } = useIsCrewOnly();

  // Auto-close mobile sidebar drawer on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  // Crew field-clock-in logins have no seat in the PO/CMMS module — keep them
  // confined to /crm/crew, same as useCrmAccess does for the CRM module.
  useEffect(() => {
    if (!isLoading && isCrewOnly) router.replace("/crm/crew");
  }, [isLoading, isCrewOnly, router]);

  if (isCrewOnly) return null;

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <RealtimeSync />
      <SettingsLoader />

      {/* Desktop sidebar */}
      <div className="hidden h-full md:flex">
        <AppSidebar />
      </div>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop — touch-none prevents scroll bleed to page behind */}
          <div
            className="absolute inset-0 bg-black/50 touch-none"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Sidebar — overscroll-contain keeps scroll inside the drawer */}
          <div className="relative z-10 h-full w-[260px] overflow-y-auto overscroll-contain">
            <AppSidebar />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
