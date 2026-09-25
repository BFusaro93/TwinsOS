import type { SupabaseClient } from "@supabase/supabase-js";
import { complexityFactor } from "@/lib/estimate-calc";
import { logger } from "@/lib/logger";

const log = logger.child("estimate-versions");

/**
 * Records the estimate exactly as the client accepted it, as the next
 * estimate_versions row. Versions were only written when the estimate was
 * emailed — but a sent estimate stays editable and its proposal link shows
 * edits live, so what a client signed could differ from every stored version.
 * Also resolves the estimate's open change requests. Call after the accept
 * has been applied and totals recalculated. Best-effort:
 * a failure is logged, never surfaced to the client who just accepted.
 */
export async function recordAcceptedVersion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  estimateId: string,
  acceptedBy: string,
  via: "proposal_link" | "client_portal"
): Promise<void> {
  try {
    const { data: est, error } = await supabase
      .from("estimates")
      .select("org_id, estimate_number, description, stage, subtotal_cents, tax_cents, discount_cents, total_cents, notes, valid_until_date, estimate_line_items(*)")
      .eq("id", estimateId)
      .single();
    if (error || !est) throw error ?? new Error("estimate not found");

    const { count } = await supabase
      .from("estimate_versions")
      .select("*", { count: "exact", head: true })
      .eq("estimate_id", estimateId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineItems = ((est.estimate_line_items ?? []) as any[])
      .filter((li) => !li.deleted_at)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const { error: insErr } = await supabase.from("estimate_versions").insert({
      org_id: est.org_id,
      estimate_id: estimateId,
      version_number: (count ?? 0) + 1,
      sent_to_email: null,
      created_by: null,
      // Same shape as the send-email snapshot, plus who accepted and how.
      snapshot: {
        estimateNumber: est.estimate_number,
        description: est.description,
        stage: est.stage,
        subtotalCents: est.subtotal_cents,
        taxCents: est.tax_cents,
        discountCents: est.discount_cents,
        totalCents: est.total_cents,
        notes: est.notes,
        validUntil: est.valid_until_date,
        acceptedBy,
        acceptedAt: new Date().toISOString(),
        acceptedVia: via,
        lineItems: lineItems.map((li) => ({
          id: li.id,
          serviceName: li.service_name,
          qty: li.qty,
          rateCents: Math.round((li.adj_rate_cents ?? li.rate_cents ?? 0) * complexityFactor(li.complexity_bps)),
          visits: li.visits,
          totalCents: li.total_cents,
          unitType: li.unit_type,
          estimateDesc: li.estimate_desc,
          status: li.status,
          rowType: li.row_type ?? "item",
          sectionName: li.section_name,
        })),
      },
    });
    if (insErr) throw insErr;

    // Accepting answers any open change request — left open, it kept
    // flagging a done estimate as waiting on the office.
    await supabase
      .from("estimate_change_requests")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("estimate_id", estimateId)
      .eq("status", "open");
  } catch (err) {
    log.error("failed to record accepted version", { estimateId, err: err instanceof Error ? err.message : String(err) });
  }
}
