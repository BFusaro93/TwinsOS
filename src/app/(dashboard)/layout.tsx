"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppSidebar } from "@/components/shared/AppSidebar";
import { TopBar } from "@/components/shared/TopBar";
import { RealtimeSync } from "@/components/shared/RealtimeSync";
import { SettingsLoader } from "@/components/shared/SettingsLoader";
import { EquiptQuickAddOverlay } from "@/components/shared/EquiptQuickAddOverlay";
import { useUIStore, SidebarDrawerProvider } from "@/stores";
import { useIsCrewOnly } from "@/lib/hooks/use-permissions";
import { useTrialStatus } from "@/lib/hooks/use-trial-status";
import { TrialBanner } from "@/components/shared/TrialBanner";
import { AccessLockedScreen } from "@/components/shared/AccessLockedScreen";
import { NAV_SECTIONS } from "@/components/shared/nav-config";
import { usePageTitle } from "@/lib/hooks/use-page-title";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const pathname = usePathname();
  const router = useRouter();
  const { isCrewOnly, isLoading } = useIsCrewOnly();
  const { isExpired: trialExpired, lockReason, isLoading: trialLoading } = useTrialStatus();

  usePageTitle(pathname, NAV_SECTIONS, "Equipt");

  // Auto-close mobile sidebar drawer on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  // Crew field-clock-in logins have no seat in the PO/CMMS module — send them
  // back to /home (CrewHome: Dashboards + Job Photos) rather than into the
  // CRM shell, which they also have no access to.
  useEffect(() => {
    if (!isLoading && isCrewOnly) router.replace("/home");
  }, [isLoading, isCrewOnly, router]);

  if (isCrewOnly) return null;

  // Trial expiry takes priority over everything else in this shell — an org
  // whose trial ran out is locked out of Equipt regardless of role.
  if (!trialLoading && trialExpired) {
    return <AccessLockedScreen reason={lockReason ?? "trial"} />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <RealtimeSync />
      <SettingsLoader />
      <EquiptQuickAddOverlay />

      {/* Docked sidebar — lg+ only. Below that (phones and portrait tablets)
          the 260px rail leaves too little room for the content beside it, so it
          becomes the drawer below. */}
      <div className="hidden h-full lg:flex">
        <AppSidebar />
      </div>

      {/* Drawer sidebar — phones and portrait tablets */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop — touch-none prevents scroll bleed to page behind */}
          <div
            className="absolute inset-0 bg-black/50 touch-none"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Sidebar — overscroll-contain keeps scroll inside the drawer */}
          <div className="relative z-10 h-full w-[260px] overflow-y-auto overscroll-contain">
            <SidebarDrawerProvider>
              <AppSidebar />
            </SidebarDrawerProvider>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <TrialBanner />
        <TopBar />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
