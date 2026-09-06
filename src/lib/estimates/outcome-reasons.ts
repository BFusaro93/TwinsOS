// Won / Lost reason lists for estimates.
//
// Reasons are org-configurable via crm_list_options (Settings → Estimates →
// Won/Lost Reasons). Historically ONE list, `estimate_reasons`, fed both the
// "Mark as Accepted" and "Mark as Lost" dialogs — so an org that had only
// added "Client accepted proposal" saw that as the sole choice when marking a
// quote LOST. Lost reasons now come from their own list, and both dialogs fall
// back to a sensible default set when the org hasn't configured anything.

/** Legacy list name — kept for won reasons so existing org data still applies. */
export const WON_REASONS_LIST = "estimate_reasons";
export const LOST_REASONS_LIST = "estimate_lost_reasons";

export const DEFAULT_LOST_REASONS = [
  "Price too high",
  "Timing",
  "Went with competitor",
  "No response",
  "Scope changed",
  "Other",
] as const;

export const DEFAULT_WON_REASONS = [
  "Client accepted proposal",
  "Best value",
  "Existing relationship",
  "Referral",
  "Other",
] as const;

/** An accepted-outcome phrase that must never be offered as a LOST reason. */
const ACCEPTED_OUTCOME_RE = /\baccept(ed|ance)?\b|\bwon\b/i;

export function isAcceptedOutcomeReason(value: string): boolean {
  return ACCEPTED_OUTCOME_RE.test(value);
}

/**
 * Resolve the choices for a Won/Lost dialog from the org-configured list,
 * falling back to defaults when the (filtered) list is empty.
 */
export function resolveOutcomeReasons(stage: "accepted" | "lost", configured: string[]): string[] {
  const cleaned = configured.map((v) => v.trim()).filter(Boolean);
  if (stage === "lost") {
    // Guard against accepted-outcome phrases that leaked in from the shared legacy list.
    const lost = cleaned.filter((v) => !isAcceptedOutcomeReason(v));
    return lost.length > 0 ? lost : [...DEFAULT_LOST_REASONS];
  }
  return cleaned.length > 0 ? cleaned : [...DEFAULT_WON_REASONS];
}
