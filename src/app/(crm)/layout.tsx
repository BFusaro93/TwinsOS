"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { CRMSidebar } from "@/components/crm/CRMSidebar";
import { TopBar } from "@/components/shared/TopBar";
import { SettingsLoader } from "@/components/shared/SettingsLoader";
import { useUIStore } from "@/stores";

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  const { setSidebarOpen } = useUIStore();
  const pathname = usePathname();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <SettingsLoader />
      <div className="hidden h-full md:flex">
        <CRMSidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
