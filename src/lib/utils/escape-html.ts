/**
 * Escapes text for safe interpolation into HTML markup. Merge-tag values
 * here originate from freeform fields (client display name, org name/phone)
 * that staff — or in some flows an external submitter — control; without
 * this, a name containing `<`/`&`/quotes breaks the HTML or, worse, injects
 * markup/script into an email actually delivered to a real recipient (same
 * class of bug fixed for form-submission notification emails).
 *
 * Lives here rather than in `lib/email/send.ts` because the document template
 * renderer needs it on the client: importing it from `send.ts` dragged the
 * whole Resend SDK (and svix) into every client chunk that touches a document
 * template, and created a send ↔ renderer import cycle. Keep this module free
 * of dependencies so either side can import it.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
