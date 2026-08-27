"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { AppSidebar } from "@/components/shared/AppSidebar";
import { TopBar } from "@/components/shared/TopBar";
import { RealtimeSync } from "@/components/shared/RealtimeSync";
import { SettingsLoader } from "@/components/shared/SettingsLoader";
import { EquiptQuickAddOverlay } from "@/components/shared/EquiptQuickAddOverlay";
import { useUIStore } from "@/stores";
import { useIsCrewOnly } from "@/lib/hooks/use-permissions";
import { useTrialStatus } from "@/lib/hooks/use-trial-status";
import { TrialBanner } from "@/components/shared/TrialBanner";
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
  const { isExpired: trialExpired, isLoading: trialLoading } = useTrialStatus();

  usePageTitle(pathname, NAV_SECTIONS, "Equipt");

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

  // Trial expiry takes priority over everything else in this shell — an org
  // whose trial ran out is locked out of Equipt regardless of role.
  if (!trialLoading && trialExpired) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Your trial has ended</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your 30-day trial is over. Subscribe to a plan to keep using Landscapt and Equipt — your data
            is all still here.
          </p>
          <Link
            href="/settings?tab=subscription"
            className="mt-4 inline-block rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Choose a plan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <RealtimeSync />
      <SettingsLoader />
      <EquiptQuickAddOverlay />

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
        <TrialBanner />
        <TopBar />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
