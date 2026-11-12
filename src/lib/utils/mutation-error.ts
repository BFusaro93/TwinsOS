/**
 * Toast text for a failed write. A 42501 (insufficient_privilege) comes from
 * the crm_roles write guards in the database ("You do not have permission to
 * edit estimates") or from an RLS policy; either way the user should see that
 * it was a permission problem, not a generic "Failed to …". Everything else
 * keeps the caller's fallback.
 *
 * In a read-only org (canceled subscription, expired trial) a 42501 is the
 * read_only_when_canceled_* policies, so the message says that instead.
 *
 * Supabase errors are plain PostgrestError objects, not Error instances, so
 * `err instanceof Error ? err.message : …` drops them.
 */
let orgReadOnly = false;

/** Kept current by useTrialStatus, so a write refused in a canceled org (or an
 *  expired trial) says why instead of "You do not have permission". */
export function setOrgReadOnlyForErrors(value: boolean): void {
  orgReadOnly = value;
}

export const READ_ONLY_ORG_MESSAGE =
  "This account is read-only because its subscription or free trial has ended. Subscribe in Settings → Subscription to make changes.";

export function mutationErrorMessage(err: unknown, fallback: string): string {
  const e = err as { code?: unknown; message?: unknown } | null | undefined;
  if (e && e.code === "42501" && orgReadOnly) return READ_ONLY_ORG_MESSAGE;
  if (e && e.code === "42501") {
    const message = typeof e.message === "string" ? e.message : "";
    // RLS refusals read "new row violates row-level security policy for table …".
    if (message && !message.includes("row-level security")) return message;
    return "You do not have permission to do that.";
  }
  return fallback;
}
