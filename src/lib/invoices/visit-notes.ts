import { logger } from "@/lib/logger";
import { notesToPlainText } from "@/lib/utils/rich-notes";

const log = logger.child("invoice-visit-notes");

function formatDate(d: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return y && m && day ? `${m}/${day}/${y}` : d;
}

/** The technician's completion note from each visit this invoice bills, as one
 *  block of text for the invoice's Notes section. A single note is returned
 *  as-is; several are prefixed with the visit date. Returns null when no
 *  billed visit has a note. Failure-tolerant and always scoped by org_id. */
export async function loadInvoiceVisitNotes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  visitIds: (string | null | undefined)[]
): Promise<string | null> {
  const ids = [...new Set(visitIds.filter((v): v is string => Boolean(v)))];
  if (ids.length === 0) return null;
  try {
    const { data, error } = await supabase
      .from("crm_job_visits")
      .select("id, scheduled_date, completion_notes")
      .eq("org_id", orgId)
      .in("id", ids)
      .is("deleted_at", null);
    if (error) {
      log.error("load visit notes failed", { error: error.message });
      return null;
    }
    const rows = ((data ?? []) as { scheduled_date: string | null; completion_notes: string | null }[])
      .map((v) => ({ date: v.scheduled_date, text: notesToPlainText(v.completion_notes).trim() }))
      .filter((v) => v.text)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    if (rows.length === 0) return null;
    if (rows.length === 1) return rows[0].text;
    return rows.map((r) => (r.date ? `${formatDate(r.date)}: ${r.text}` : r.text)).join("\n");
  } catch (err) {
    log.error("load visit notes threw", { error: err });
    return null;
  }
}

/** Merges the invoice's own notes with the visit notes block. */
export function combineInvoiceNotes(own: string | null, visitNotes: string | null): string | null {
  const parts = [own?.trim(), visitNotes?.trim()].filter(Boolean) as string[];
  return parts.length ? parts.join("\n\n") : null;
}
