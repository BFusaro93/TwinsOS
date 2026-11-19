"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/shared/BrandMark";
import { RealtimeSync } from "@/components/shared/RealtimeSync";
import { AppearanceMenu } from "@/components/shared/AppearanceMenu";
import { useIsStaff } from "@/lib/hooks/use-impersonation";

const TABS = [
  { href: "/internal", label: "Impersonate" },
  { href: "/internal/chat", label: "Chat" },
  { href: "/internal/feedback", label: "Feedback" },
  { href: "/internal/ask-ai", label: "Ask AI" },
  { href: "/internal/health", label: "Health" },
  { href: "/internal/platform-fees", label: "Payment fee" },
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
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  // On a phone the tab strip scrolls sideways; keep the current tab in view.
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname, isStaff]);

  useEffect(() => {
    if (!isLoading && !isStaff) router.replace("/equipt/home");
  }, [isLoading, isStaff, router]);

  if (isLoading || !isStaff) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50 dark:bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400 dark:text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 dark:bg-background">
      <RealtimeSync />
      {/* Below lg the tabs drop to their own scrollable row under the brand. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 border-b bg-card px-4 lg:h-14 lg:flex-nowrap">
        <div className="flex h-12 items-center gap-2 lg:h-auto">
          <BrandMark variant="color" className="h-7 w-7 rounded-md" />
          <span className="font-semibold text-slate-800 dark:text-neutral-100">Staff Tools</span>
        </div>
        <nav className="order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:order-none lg:mx-0 lg:w-auto lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              ref={pathname === tab.href ? activeTabRef : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors lg:py-1.5",
                pathname === tab.href
                  ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {/* Theme + display size — also what applies the saved 80% scale here. */}
        <div className="ml-auto flex h-12 items-center lg:h-auto">
          <AppearanceMenu />
        </div>
      </header>
      <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
    </div>
  );
}
