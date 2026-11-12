"use client";

import Link from "next/link";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";

/**
 * Full-shell lockout once read-only access has run out: 90 days after a trial
 * ended or a subscription was canceled — see useTrialStatus. Only an admin can
 * subscribe (Settings → Subscription is admin-only), so everyone else is told
 * to ask one instead of being sent to a page they can't use.
 */
export function AccessLockedScreen({ reason }: { reason: "trial" | "canceled" }) {
  const { data: profile } = useCurrentProfile();
  const isAdmin = profile?.role === "admin";

  const title = reason === "canceled" ? "Your subscription has ended" : "Your free trial has ended";
  const body =
    reason === "canceled"
      ? "The 90 days of read-only access after canceling have run out. Resubscribe to keep using Landscapt and Equipt — your data is all still here."
      : "Your trial ended more than 90 days ago, so its read-only access has run out. Subscribe to a plan to keep using Landscapt and Equipt — your data is all still here.";

  return (
    <div className="flex h-dvh items-center justify-center bg-slate-50 dark:bg-background p-6">
      <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        {isAdmin ? (
          <Link
            href="/settings?tab=subscription"
            className="mt-4 inline-block rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            {reason === "canceled" ? "Resubscribe" : "Choose a plan"}
          </Link>
        ) : (
          <p className="mt-4 text-sm font-medium text-slate-700 dark:text-neutral-300">
            Ask an account admin to {reason === "canceled" ? "resubscribe" : "choose a plan"} in Settings → Subscription.
          </p>
        )}
      </div>
    </div>
  );
}
