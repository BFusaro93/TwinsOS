"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CRMSidebar } from "@/components/crm/CRMSidebar";
import { TopBar } from "@/components/shared/TopBar";
import { RealtimeSync } from "@/components/shared/RealtimeSync";
import { SettingsLoader } from "@/components/shared/SettingsLoader";
import { QuickAddOverlay } from "@/components/crm/QuickAddOverlay";
import { useUIStore } from "@/stores";
import { useCrmAccess } from "@/lib/hooks/use-permissions";

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const pathname = usePathname();
  const { allowed, isLoading } = useCrmAccess(pathname);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  if (!isLoading && !allowed) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">No CRM access yet</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your login isn&apos;t linked to a CRM employee record, so you don&apos;t have access to this
            section. Ask an admin to add you under Team &rarr; Employees and assign a CRM role.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
            Go to dashboard &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <RealtimeSync />
      <SettingsLoader />

      {/* Desktop sidebar */}
      <div className="hidden h-full md:flex">
        <CRMSidebar />
      </div>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 touch-none"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 h-full w-[260px] overflow-y-auto overscroll-contain">
            <CRMSidebar />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <QuickAddOverlay />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
