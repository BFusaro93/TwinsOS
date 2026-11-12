"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useTrialStatus } from "@/lib/hooks/use-trial-status";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";

function todayKey(): string {
  return `trial-banner-dismissed-${new Date().toISOString().slice(0, 10)}`;
}

/** Persistent (dismissible-per-day) trial countdown, shown above the app shell — see (crm)/layout.tsx and (dashboard)/layout.tsx. */
export function TrialBanner() {
  const { isTrial, isExpired, trialEndsAt, daysRemaining, isReadOnly, readOnlyReason, accessEndsAt, isLoading } =
    useTrialStatus();
  const { data: profile } = useCurrentProfile();
  // Only admins can open Settings → Subscription; everyone else is told who to ask.
  const isAdmin = profile?.role === "admin";
  const [dismissed, setDismissed] = useState(true); // avoid a flash before we know today's dismiss state

  useEffect(() => {
    setDismissed(typeof window !== "undefined" && localStorage.getItem(todayKey()) === "1");
  }, []);

  // Read-only (canceled subscription, or a trial that ended): not dismissible —
  // every save will fail, so the reason has to stay on screen.
  if (!isLoading && isReadOnly && accessEndsAt) {
    const until = new Date(accessEndsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const what = readOnlyReason === "trial" ? "Your free trial has ended" : "Your subscription was canceled";
    const action = readOnlyReason === "trial" ? "Subscribe" : "Resubscribe";
    return (
      <div className="flex items-center gap-3 bg-amber-500 px-4 py-2 text-sm text-white">
        <span>
          {what} — your account is read-only until {until} ({daysRemaining} day
          {daysRemaining === 1 ? "" : "s"} left). You can still view, export and email sent invoices and statements.{" "}
          {isAdmin ? (
            <Link href="/settings?tab=subscription" className="font-semibold underline underline-offset-2">
              {action}
            </Link>
          ) : (
            <span className="font-semibold">Ask an account admin to {action.toLowerCase()}.</span>
          )}
        </span>
      </div>
    );
  }

  // An open-ended trial (plan = "trial" with no trial_ends_at — e.g. the
  // internal Twins org) has nothing to count down to; useTrialStatus reports
  // Infinity days remaining, which used to render as "Infinity days left".
  // SubscriptionTab already hides the end date in that case — match it here.
  if (isLoading || !isTrial || isExpired || dismissed || trialEndsAt == null) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-brand-500 px-4 py-2 text-sm text-white">
      <span>
        {daysRemaining === 0 ? "Your trial ends today." : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left in your trial.`}{" "}
        {isAdmin ? (
          <Link href="/settings?tab=subscription" className="font-semibold underline underline-offset-2">
            Subscribe now
          </Link>
        ) : (
          <span className="font-semibold">Ask an account admin to subscribe.</span>
        )}
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
