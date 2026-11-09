/**
 * Copy text to the clipboard without ever rejecting.
 *
 * `navigator.clipboard.writeText` rejects with NotAllowedError when the
 * browser refuses — Safari outside a direct user gesture, a non-secure
 * context, a permissions-policy block, or a missing Clipboard API — and an
 * un-awaited call surfaces that as an unhandled rejection in Sentry. Resolves
 * `false` instead so the caller can fall back (show the text, skip the
 * "Copied" state) rather than crash.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
