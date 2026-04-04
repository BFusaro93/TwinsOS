"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ReportsSidebar } from "@/components/shared/ReportsSidebar";
import { TopBar } from "@/components/shared/TopBar";
import { RealtimeSync } from "@/components/shared/RealtimeSync";
import { SettingsLoader } from "@/components/shared/SettingsLoader";
import { useUIStore } from "@/stores";

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const pathname = usePathname();

  // Auto-close mobile sidebar drawer on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <RealtimeSync />
      <SettingsLoader />

      {/* Desktop sidebar */}
      <div className="hidden md:flex">
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
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
