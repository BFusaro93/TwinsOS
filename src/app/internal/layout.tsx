"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/shared/BrandMark";
import { RealtimeSync } from "@/components/shared/RealtimeSync";
import { useIsStaff } from "@/lib/hooks/use-impersonation";

const TABS = [
  { href: "/internal", label: "Impersonate" },
  { href: "/internal/chat", label: "Chat" },
];

/**
 * Staff-only area — not linked from any nav, not discoverable by
 * subscribers. This client-side check is a UX gate only (same pattern as
 * useModuleAccess/useCrmAccess elsewhere): the real security boundary is
 * server-side RLS (is_staff() gating every table this area touches), so a
 * subscriber hitting this URL directly still can't see or do anything here
 * even if this redirect were bypassed.
 */
export default function InternalLayout({ children }: { children: React.ReactNode }) {
  const { data: isStaff, isLoading } = useIsStaff();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isStaff) router.replace("/dashboard");
  }, [isLoading, isStaff, router]);

  if (isLoading || !isStaff) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50">
      <RealtimeSync />
      <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-white px-4">
        <div className="flex items-center gap-2">
          <BrandMark variant="color" className="h-7 w-7 rounded-md" />
          <span className="font-semibold text-slate-800">Staff Tools</span>
        </div>
        <nav className="flex items-center gap-1">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === tab.href
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-500 hover:bg-slate-100"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
    </div>
  );
}
