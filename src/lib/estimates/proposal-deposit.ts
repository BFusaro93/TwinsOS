import { deriveProposalTotals, proposalLineNet } from "@/lib/estimates/proposal-totals";

/**
 * The deposit a client is asked for on a proposal, for the scope they are
 * accepting. Shared by the public proposal page (what it displays) and the
 * deposit-intent route (what it charges), so the two can never disagree.
 *
 * A deposit is a down payment on the job, so it never exceeds the total being
 * accepted. On a Good/Better/Best proposal that total depends on the tier the
 * client picked: the stored total_cents is priced on ONE tier (the cheapest),
 * so capping against it under-charged a client who chose a bigger package.
 * With a tier, the cap is that tier's total (the same derivation the page
 * shows and the accept route records); with no valid tier, the highest tier's
 * total (never the cheapest — a cap can only be too generous, not short).
 */

export const PROPOSAL_TIERS = ["basic", "standard", "premium"] as const;
export type ProposalTier = (typeof PROPOSAL_TIERS)[number];

interface DepositLine {
  rowType: string | null;
  tier: string | null;
  totalCents: number;
  discountCents?: number | null;
  subitemTotalCents?: number | null;
}

export interface ProposalDepositInput {
  depositRequiredCents: number;
  totalCents: number;
  tiersEnabled: boolean;
  discountCents: number;
  discountType: string | null;
  discountValue: number | null;
  taxRateBps: number;
  lineItems: DepositLine[];
  agreedLineItems?: DepositLine[] | null;
}

/** Tiers that actually have priced lines. */
export function tiersWithPricedLines(lineItems: DepositLine[]): ProposalTier[] {
  return PROPOSAL_TIERS.filter((t) => lineItems.some((li) => li.rowType !== "section" && li.tier === t));
}

/** The proposal total for one tier: untiered lines + that tier's lines +
 *  lines already agreed, with the header discount and tax re-applied. */
export function proposalTierTotalCents(p: ProposalDepositInput, tier: ProposalTier): number {
  const agreed = (p.agreedLineItems ?? []).reduce((s, li) => s + proposalLineNet(li), 0);
  const subtotal =
    agreed +
    p.lineItems
      .filter((li) => li.rowType !== "section" && (li.tier === null || li.tier === tier))
      .reduce((s, li) => s + proposalLineNet(li), 0);
  return deriveProposalTotals(p, subtotal).totalCents;
}

/** The deposit to ask for / charge. `selectedTier` is ignored on a proposal
 *  without tiers, and an unknown or empty tier falls back to the highest. */
export function proposalDepositCents(p: ProposalDepositInput, selectedTier?: string | null): number {
  const required = Math.max(0, p.depositRequiredCents ?? 0);
  if (required <= 0) return 0;
  let cap = p.totalCents;
  const tiers = p.tiersEnabled ? tiersWithPricedLines(p.lineItems) : [];
  if (tiers.length > 0) {
    const chosen = tiers.find((t) => t === selectedTier);
    cap = chosen
      ? proposalTierTotalCents(p, chosen)
      : Math.max(...tiers.map((t) => proposalTierTotalCents(p, t)));
  }
  return cap > 0 ? Math.min(required, cap) : required;
}
