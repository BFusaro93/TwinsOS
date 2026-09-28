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
  // max + 1, not count + 1: count drifts from the numbering if a version row
  // is ever removed, and then collides with an existing number.
  const { data } = await supabase
    .from("estimate_versions")
    .select("version_number")
    .eq("estimate_id", estimateId)
    .order("version_number", { ascending: false })
    .limit(1);
  const top = (data as { version_number: number }[] | null)?.[0]?.version_number ?? 0;
  return top + 1;
}

/**
 * Inserts the next estimate_versions row, numbering it max+1 and retrying on
 * a unique-violation. (estimate_id, version_number) is unique
 * (20260927120000); two sends racing used to both write the same "v3".
 * Returns the version number written, or throws the last error.
 */
export async function insertEstimateVersion(
  supabase: AnySupabase,
  row: { org_id: unknown; estimate_id: string; sent_to_email: string | null; created_by: string | null; snapshot: unknown },
): Promise<number> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const versionNumber = await nextVersionNumber(supabase, row.estimate_id);
    const { error } = await supabase.from("estimate_versions").insert({ ...row, version_number: versionNumber });
    if (!error) return versionNumber;
    lastError = error;
    if ((error as { code?: string }).code !== "23505") break;
  }
  throw lastError instanceof Error ? lastError : new Error((lastError as { message?: string } | null)?.message ?? "Failed to record estimate version");
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
  try {
    return await insertEstimateVersion(supabase, {
      org_id: (est as Record<string, unknown>).org_id,
      estimate_id: estimateId,
      sent_to_email: null,
      created_by: userId,
      snapshot: { ...buildVersionSnapshot(est as Record<string, unknown>), sharedVia: "link", proposal: live },
    });
  } catch (err) {
    log.error("failed to publish shared version", { estimateId, error: err instanceof Error ? err.message : String(err) });
    return published?.versionNumber ?? null;
  }
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

    await insertEstimateVersion(supabase, {
      org_id: (est as Record<string, unknown>).org_id,
      estimate_id: estimateId,
      sent_to_email: null,
      created_by: null,
      snapshot: {
        ...buildVersionSnapshot(est as Record<string, unknown>),
        acceptedBy,
        acceptedAt: new Date().toISOString(),
        acceptedVia: via,
      },
    });

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
