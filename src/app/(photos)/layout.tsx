"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { PhotosSidebar } from "@/components/photo-docs/PhotosSidebar";
import { TopBar } from "@/components/shared/TopBar";
import { RealtimeSync } from "@/components/shared/RealtimeSync";
import { SettingsLoader } from "@/components/shared/SettingsLoader";
import { InternalOnlyGuard } from "@/components/shared/InternalOnlyGuard";
import { useUIStore } from "@/stores";

const INTERNAL_ONLY_PATHS = ["/photos/field/crew-checklist", "/photos/field/time-off"];

export default function PhotosLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const pathname = usePathname();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <RealtimeSync />
      <SettingsLoader />

      {/* Desktop sidebar */}
      <div className="hidden h-full md:flex">
        <PhotosSidebar />
      </div>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50 touch-none" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 h-full w-[260px] overflow-y-auto overscroll-contain">
            <PhotosSidebar />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <InternalOnlyGuard restrictedPaths={INTERNAL_ONLY_PATHS}>{children}</InternalOnlyGuard>
        </main>
      </div>
    </div>
  );
}
