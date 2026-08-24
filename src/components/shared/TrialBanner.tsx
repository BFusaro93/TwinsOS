"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useTrialStatus } from "@/lib/hooks/use-trial-status";

function todayKey(): string {
  return `trial-banner-dismissed-${new Date().toISOString().slice(0, 10)}`;
}

/** Persistent (dismissible-per-day) trial countdown, shown above the app shell — see (crm)/layout.tsx and (dashboard)/layout.tsx. */
export function TrialBanner() {
  const { isTrial, isExpired, daysRemaining, isLoading } = useTrialStatus();
  const [dismissed, setDismissed] = useState(true); // avoid a flash before we know today's dismiss state

  useEffect(() => {
    setDismissed(typeof window !== "undefined" && localStorage.getItem(todayKey()) === "1");
  }, []);

  if (isLoading || !isTrial || isExpired || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-brand-500 px-4 py-2 text-sm text-white">
      <span>
        {daysRemaining === 0 ? "Your trial ends today." : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left in your trial.`}{" "}
        <Link href="/settings?tab=subscription" className="font-semibold underline underline-offset-2">
          Subscribe now
        </Link>
      </span>
      <button
        type="button"
        aria-label="Dismiss for today"
        onClick={() => {
          localStorage.setItem(todayKey(), "1");
          setDismissed(true);
        }}
        className="shrink-0 rounded p-0.5 hover:bg-white/20"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
