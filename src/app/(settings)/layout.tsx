"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SettingsSidebar } from "@/components/shared/SettingsSidebar";
import { TopBar } from "@/components/shared/TopBar";
import { RealtimeSync } from "@/components/shared/RealtimeSync";
import { SettingsLoader } from "@/components/shared/SettingsLoader";
import { useUIStore } from "@/stores";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const pathname = usePathname();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50 print:h-auto print:overflow-visible print:block">
      <RealtimeSync />
      <SettingsLoader />

      <div className="hidden h-full md:flex print:hidden">
        <SettingsSidebar />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 h-full w-[260px]">
            <SettingsSidebar />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
        <div className="print:hidden">
          <TopBar />
        </div>
        <main className="flex-1 overflow-auto p-4 md:p-6 print:overflow-visible print:p-0">{children}</main>
      </div>
    </div>
  );
}
