// Org-level settings for the "estimate accepted" confirmation email. They live
// in the organizations.customizations jsonb bag (written via
// merge_org_customizations), so no schema change is needed.

export type ConfirmationRecipient = "billing_email" | "primary_email";

export interface ConfirmationSettings {
  /** Active Documents template (type client or estimate); null = built-in email. */
  documentId: string | null;
  recipient: ConfirmationRecipient;
  includeEstimatePdf: boolean;
}

export const CONFIRMATION_KEYS = {
  documentId: "estimate_confirmation_document_id",
  recipient: "estimate_confirmation_recipient",
  includeEstimatePdf: "estimate_confirmation_include_estimate_pdf",
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getConfirmationSettings(customizations: unknown): ConfirmationSettings {
  const c = (customizations && typeof customizations === "object" ? customizations : {}) as Record<string, unknown>;
  const id = c[CONFIRMATION_KEYS.documentId];
  return {
    documentId: typeof id === "string" && UUID_RE.test(id) ? id : null,
    recipient: c[CONFIRMATION_KEYS.recipient] === "primary_email" ? "primary_email" : "billing_email",
    includeEstimatePdf: c[CONFIRMATION_KEYS.includeEstimatePdf] === true,
  };
}

/**
 * True when none of a document's blocks reference the proposal link — via the
 * [estimatelink] / [estimatelinkurl] merge tag in text or a button's href. Used
 * for non-blocking "this email won't link to the proposal" warnings.
 */
export function documentLacksEstimateLink(
  blocks: { content: string | null; settings?: Record<string, unknown> | null }[],
): boolean {
  const re = /\[estimatelink(url)?\]/i;
  return !blocks.some((b) => re.test(b.content ?? "") || re.test(JSON.stringify(b.settings ?? {})));
}
