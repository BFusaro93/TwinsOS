"use client";

import { useCurrentUserStore } from "@/stores";

/**
 * Twins Lawn Service — the platform owner's own operating org. A handful of
 * dashboards/tools were built for Twins' own business (Financial, Labor
 * Efficiency, Driver Safety Scores, CRM Report, Snow Pricing Calculator,
 * Morning Checklist, Time Off Request) and aren't part of the general
 * subscription product, so they should only ever be visible to this org.
 */
const TWINS_LAWN_SERVICE_ORG_ID = "619de9bb-f8f8-46cf-983c-9faf54f6a7d0";

export function useIsInternalOrg(): { isInternalOrg: boolean; isLoading: boolean } {
  const currentUserLoaded = useCurrentUserStore((s) => s.currentUserLoaded);
  const orgId = useCurrentUserStore((s) => s.currentUser.orgId);

  if (!currentUserLoaded) return { isInternalOrg: false, isLoading: true }; // avoid a flash of internal-only items while loading
  return { isInternalOrg: orgId === TWINS_LAWN_SERVICE_ORG_ID, isLoading: false };
}
