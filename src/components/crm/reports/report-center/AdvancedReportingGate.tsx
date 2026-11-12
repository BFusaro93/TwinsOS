"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAddonAccess } from "@/lib/hooks/use-module-access";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";

/**
 * Shows `children` only when the org has the Advanced Reporting add-on
 * (bundled on Enterprise and during a trial, purchasable on Starter/Growth);
 * otherwise an upsell. UI only — the API routes behind these tools enforce
 * the same check (src/lib/reports/advanced-reporting.ts).
 */
export function AdvancedReportingGate({
  feature,
  children,
}: {
  /** What the person tried to open, e.g. "Custom dashboards" — shown as
   *  "<feature>: included with Advanced Reporting". */
  feature: string;
  children: React.ReactNode;
}) {
  const { allowed, isLoading } = useAddonAccess("advanced_reporting");
  // Nothing until the check settles: the gated children's queries are off
  // until then, so rendering them early flashes their empty state.
  if (isLoading) return null;
  if (allowed) return <>{children}</>;
  return <AdvancedReportingUpsell feature={feature} />;
}

export function AdvancedReportingUpsell({ feature, className }: { feature: string; className?: string }) {
  const { data: profile } = useCurrentProfile();
  const isAdmin = profile?.role === "admin";
  return (
    <EmptyState
      icon={Sparkles}
      className={className}
      title={`${feature}: included with Advanced Reporting`}
      description={
        "Build your own reports, custom dashboards and reusable graphics, and email reports on a schedule. " +
        "Every prebuilt report and built-in dashboard stays available on your plan. " +
        (isAdmin
          ? "Add Advanced Reporting from your subscription settings."
          : "Ask an admin to add Advanced Reporting in Settings → Subscription.")
      }
      action={
        isAdmin ? (
          <Button asChild size="sm">
            <Link href="/settings?tab=subscription">View add-ons</Link>
          </Button>
        ) : undefined
      }
    />
  );
}
