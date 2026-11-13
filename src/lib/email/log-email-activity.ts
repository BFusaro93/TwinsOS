/**
 * Insert an email row on the client's timeline and keep a copy of what was
 * actually sent (`client_email_content`) so staff can open it later from the
 * Email Activity page or the client timeline.
 *
 * The email is already delivered by the time this runs, so nothing here may
 * throw: a failure is returned for the caller to log (or ignore), and a failed
 * content copy never loses the timeline row.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

export interface EmailContent {
  /** The exact HTML handed to Resend. */
  html: string;
  /** CC recipients, if any. */
  cc?: string[];
}

export async function insertEmailActivity(
  db: AnyDb,
  row: Record<string, unknown>,
  content?: EmailContent,
): Promise<{ error: { message: string } | null }> {
  if (!content) {
    const { error } = await db.from("client_activity").insert(row);
    return { error };
  }
  const { data, error } = await db.from("client_activity").insert(row).select("id").single();
  if (error || !data) return { error: error ?? { message: "no activity row returned" } };
  const { error: contentErr } = await db.from("client_email_content").insert({
    org_id: row.org_id,
    activity_id: data.id,
    html: content.html,
    cc: content.cc && content.cc.length > 0 ? content.cc.join(", ") : null,
  });
  if (contentErr) {
    // eslint-disable-next-line no-console -- no structured logger in this shared helper
    console.error("[email-activity] sent-email content not saved:", contentErr.message);
  }
  return { error: null };
}
