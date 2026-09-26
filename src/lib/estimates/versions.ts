import type { SupabaseClient } from "@supabase/supabase-js";
import { complexityFactor } from "@/lib/estimate-calc";
import { logger } from "@/lib/logger";
import {
  PROPOSAL_ESTIMATE_SELECT,
  buildProposalContent,
  getPublishedProposal,
  proposalFingerprint,
} from "@/lib/estimates/proposal-content";

const log = logger.child("estimate-versions");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>;

/** The summary snapshot the Versions tab renders (same shape send-email has
 *  always stored), from an estimates row with estimate_line_items(*). */
export function buildVersionSnapshot(est: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineItems = ((est.estimate_line_items ?? []) as any[])
    .filter((li) => !li.deleted_at)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return {
    estimateNumber: est.estimate_number,
    description: est.description,
    stage: est.stage,
    subtotalCents: est.subtotal_cents,
    taxCents: est.tax_cents,
    discountCents: est.discount_cents,
    totalCents: est.total_cents,
    notes: est.notes,
    validUntil: est.valid_until_date,
    lineItems: lineItems.map((li) => ({
      id: li.id,
      serviceName: li.service_name,
      qty: li.qty,
      // The rate as the client saw it: adjusted rate, scaled by complexity.
      rateCents: Math.round((li.adj_rate_cents ?? li.rate_cents ?? 0) * complexityFactor(li.complexity_bps)),
      visits: li.visits,
      totalCents: li.total_cents,
      unitType: li.unit_type,
      estimateDesc: li.estimate_desc,
      status: li.status,
      rowType: li.row_type ?? "item",
      sectionName: li.section_name,
    })),
  };
}

async function nextVersionNumber(supabase: AnySupabase, estimateId: string): Promise<number> {
  const { count } = await supabase
    .from("estimate_versions")
    .select("*", { count: "exact", head: true })
    .eq("estimate_id", estimateId);
  return (count ?? 0) + 1;
}

/**
 * Publishes the live estimate to its proposal link when it was shared via
 * Copy/Open link (send-email publishes on its own). A no-op when the link
 * already shows exactly this content, so repeated copies don't pile up
 * versions. Returns the version number the link now shows.
 */
export async function publishSharedVersion(
  supabase: AnySupabase,
  estimateId: string,
  userId: string | null
): Promise<number | null> {
  const { data: est } = await supabase.from("estimates").select(PROPOSAL_ESTIMATE_SELECT).eq("id", estimateId).maybeSingle();
  if (!est) return null;
  const live = buildProposalContent(est as Record<string, unknown>);
  const published = await getPublishedProposal(supabase, estimateId);
  if (published && proposalFingerprint(published.content) === proposalFingerprint(live)) {
    return published.versionNumber;
  }
  const versionNumber = await nextVersionNumber(supabase, estimateId);
  const { error } = await supabase.from("estimate_versions").insert({
    org_id: (est as Record<string, unknown>).org_id,
    estimate_id: estimateId,
    version_number: versionNumber,
    sent_to_email: null,
    created_by: userId,
    snapshot: { ...buildVersionSnapshot(est as Record<string, unknown>), sharedVia: "link", proposal: live },
  });
  if (error) {
    log.error("failed to publish shared version", { estimateId, error: error.message });
    return published?.versionNumber ?? null;
  }
  return versionNumber;
}

/**
 * Records the estimate exactly as the client accepted it, as the next
 * estimate_versions row, and resolves the estimate's open change requests.
 * Call after the accept has been applied and totals recalculated.
 * Best-effort: a failure is logged, never surfaced to the client who just
 * accepted. (No `proposal` key — this row isn't something the link shows.)
 */
export async function recordAcceptedVersion(
  supabase: AnySupabase,
  estimateId: string,
  acceptedBy: string,
  via: "proposal_link" | "client_portal"
): Promise<void> {
  try {
    const { data: est, error } = await supabase
      .from("estimates")
      .select("*, estimate_line_items(*)")
      .eq("id", estimateId)
      .single();
    if (error || !est) throw error ?? new Error("estimate not found");

    const { error: insErr } = await supabase.from("estimate_versions").insert({
      org_id: (est as Record<string, unknown>).org_id,
      estimate_id: estimateId,
      version_number: await nextVersionNumber(supabase, estimateId),
      sent_to_email: null,
      created_by: null,
      snapshot: {
        ...buildVersionSnapshot(est as Record<string, unknown>),
        acceptedBy,
        acceptedAt: new Date().toISOString(),
        acceptedVia: via,
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
