import type { SupabaseClient } from "@supabase/supabase-js";
import { toDisplaySettings } from "@/lib/estimate-display-settings";

/**
 * What a client sees and signs on the public proposal page — the
 * estimate-dependent part of the page payload.
 *
 * A proposal link shows the version that was last SENT (emailed, or shared via
 * Copy/Open link), not the live estimate: the office can keep editing a sent
 * estimate without the client seeing, or accepting, a half-finished revision.
 * Each send stores this object as `snapshot.proposal` on its estimate_versions
 * row; the page renders the newest one, and acceptance is refused while the
 * live estimate differs from it (until it is sent again).
 */
export interface ProposalContent {
  description: string | null;
  validUntil: string | null;
  notes: string | null;
  lineItems: {
    id: string;
    rowType: "item" | "section";
    sectionName: string | null;
    serviceName: string | null;
    estimateDesc: string | null;
    qty: number;
    unitType: string | null;
    rateCents: number;
    visits: number;
    totalCents: number;
    status: string;
    tier: string | null;
    /** For the PDF, which prints the adjusted, complexity-scaled rate. */
    adjRateCents: number | null;
    complexityBps: number | null;
  }[];
  directCosts: { id: string; description: string; qty: number; rateCents: number; totalCents: number }[];
  subtotalCents: number;
  taxRateBps: number;
  taxCents: number;
  discountCents: number;
  discountType: "percent" | "flat" | null;
  discountValue: number | null;
  showDiscounts: boolean;
  totalCents: number;
  tiersEnabled: boolean;
  tierLabels: { basic: string; standard: string; premium: string };
  displaySettings: ReturnType<typeof toDisplaySettings>;
  depositRequiredCents: number;
}

/** Builds ProposalContent from an estimates row selected with
 *  `estimate_line_items(*)` and `estimate_direct_costs(...)`. */
export function buildProposalContent(est: Record<string, unknown>): ProposalContent {
  const lineItems = ((est.estimate_line_items ?? []) as Record<string, unknown>[])
    .filter((li) => !li.deleted_at && li.status === "quote")
    .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
    .map((li) => ({
      id: li.id as string,
      rowType: ((li.row_type as string) ?? "item") as "item" | "section",
      sectionName: (li.section_name as string | null) ?? null,
      serviceName: (li.service_name as string | null) ?? null,
      estimateDesc: (li.estimate_desc as string | null) ?? null,
      qty: (li.qty as number) ?? 1,
      unitType: (li.unit_type as string | null) ?? null,
      rateCents: (li.rate_cents as number) ?? 0,
      visits: (li.visits as number) ?? 1,
      totalCents: (li.total_cents as number) ?? 0,
      status: li.status as string,
      tier: (li.tier as string | null) ?? null,
      adjRateCents: (li.adj_rate_cents as number | null) ?? null,
      complexityBps: (li.complexity_bps as number | null) ?? null,
    }));

  return {
    description: (est.description as string | null) ?? null,
    validUntil: (est.valid_until_date as string | null) ?? null,
    notes: (est.notes as string | null) ?? null,
    lineItems,
    // Materials/equipment/subcontract lines are priced into the totals, so the
    // page has to show them or the client can't reconcile the total.
    directCosts: ((est.estimate_direct_costs ?? []) as Record<string, unknown>[])
      .slice()
      .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
      .map((d) => ({
        id: d.id as string,
        description: (d.description as string | null) ?? "",
        qty: Number(d.qty ?? 0),
        rateCents: (d.rate_cents as number) ?? 0,
        totalCents: (d.total_cents as number) ?? 0,
      })),
    subtotalCents: (est.subtotal_cents as number) ?? 0,
    taxRateBps: (est.tax_rate_bps as number) ?? 0,
    taxCents: (est.tax_cents as number) ?? 0,
    discountCents: (est.discount_cents as number) ?? 0,
    discountType: (est.discount_type as "percent" | "flat" | null) ?? null,
    discountValue: (est.discount_value as number | null) ?? null,
    showDiscounts: (est.show_discounts as boolean) ?? false,
    totalCents: (est.total_cents as number) ?? 0,
    tiersEnabled: (est.tiers_enabled as boolean) ?? false,
    tierLabels: (est.tier_labels as ProposalContent["tierLabels"]) ?? { basic: "Basic", standard: "Standard", premium: "Premium" },
    displaySettings: toDisplaySettings(est.display_settings),
    depositRequiredCents: (est.deposit_required_cents as number) ?? 0,
  };
}

/** Stable comparison key. Keys are sorted recursively: the published side has
 *  round-tripped through jsonb, which does not preserve key order. */
export function proposalFingerprint(content: ProposalContent): string {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
        : v === undefined ? null : v;
  return JSON.stringify(canon(content));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>;

export const PROPOSAL_ESTIMATE_SELECT =
  "*, estimate_line_items(*), estimate_direct_costs(id, description, qty, rate_cents, total_cents, sort_order)";

export async function loadLiveProposalContent(supabase: AnySupabase, estimateId: string): Promise<ProposalContent | null> {
  const { data } = await supabase.from("estimates").select(PROPOSAL_ESTIMATE_SELECT).eq("id", estimateId).maybeSingle();
  return data ? buildProposalContent(data as Record<string, unknown>) : null;
}

/** The newest version that recorded proposal content, i.e. what the client's
 *  link shows. Versions sent before this existed have no `proposal` and are
 *  skipped (their estimates keep showing live content). */
export async function getPublishedProposal(
  supabase: AnySupabase,
  estimateId: string
): Promise<{ versionNumber: number; content: ProposalContent } | null> {
  const { data } = await supabase
    .from("estimate_versions")
    .select("version_number, snapshot")
    .eq("estimate_id", estimateId)
    .not("snapshot->proposal", "is", null)
    .order("version_number", { ascending: false })
    .limit(1);
  const row = (data as { version_number: number; snapshot: { proposal?: ProposalContent } }[] | null)?.[0];
  return row?.snapshot?.proposal ? { versionNumber: row.version_number, content: row.snapshot.proposal } : null;
}

/** Whether the live estimate differs from what the client's link shows.
 *  False when nothing has been published yet (the link shows live content). */
export async function isChangedSinceSent(supabase: AnySupabase, estimateId: string): Promise<boolean> {
  const published = await getPublishedProposal(supabase, estimateId);
  if (!published) return false;
  const live = await loadLiveProposalContent(supabase, estimateId);
  return !!live && proposalFingerprint(live) !== proposalFingerprint(published.content);
}
