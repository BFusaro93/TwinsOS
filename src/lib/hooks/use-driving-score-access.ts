"use client";

import { useIsInternalOrg } from "./use-internal-org";
import { useIntegration } from "./use-integrations";

/**
 * The Driver Safety Scores dashboard was originally Twins-only (see
 * useIsInternalOrg), but any org with the Samsara integration can turn it on
 * for themselves via a toggle in Settings → Integrations → Samsara, which
 * sets integrations.config.driving_score_enabled for the samsara provider row.
 */
export function useHasDrivingScoreAccess(): { allowed: boolean; isLoading: boolean } {
  const { isInternalOrg, isLoading: orgLoading } = useIsInternalOrg();
  const { data: samsara, isLoading: integrationLoading } = useIntegration("samsara");

  if (orgLoading || integrationLoading) return { allowed: false, isLoading: true };
  const drivingScoreEnabled = Boolean(samsara?.config?.driving_score_enabled);
  return { allowed: isInternalOrg || drivingScoreEnabled, isLoading: false };
}
