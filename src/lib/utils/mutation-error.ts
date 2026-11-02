/**
 * Toast text for a failed write. A 42501 (insufficient_privilege) comes from
 * the crm_roles write guards in the database ("You do not have permission to
 * edit estimates") or from an RLS policy; either way the user should see that
 * it was a permission problem, not a generic "Failed to …". Everything else
 * keeps the caller's fallback.
 *
 * Supabase errors are plain PostgrestError objects, not Error instances, so
 * `err instanceof Error ? err.message : …` drops them.
 */
export function mutationErrorMessage(err: unknown, fallback: string): string {
  const e = err as { code?: unknown; message?: unknown } | null | undefined;
  if (e && e.code === "42501") {
    const message = typeof e.message === "string" ? e.message : "";
    // RLS refusals read "new row violates row-level security policy for table …".
    if (message && !message.includes("row-level security")) return message;
    return "You do not have permission to do that.";
  }
  return fallback;
}
