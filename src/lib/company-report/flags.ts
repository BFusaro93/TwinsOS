import type { CompanyReportData, CompanyReportFlag } from "@/types/company-report";
import { daysBetweenYmd, ymd, zoneDateParts } from "@/lib/time/zone";

// ============================================================
// Company Report — rule-based flags.
//
// Deliberately mechanical: fixed dollar/percent thresholds evaluated against
// the same numbers already shown on the report, no free-form commentary and
// no AI call. This replaces the old screenshot-report's hand-written
// "Flags & Priority Actions" section, which was AI-generated narrative
// judgment about specific accounts — that level of nuance isn't reproduced
// here on purpose; a future version could layer an actual Claude API call
// on top of this same data for richer commentary, but that's a separate
// product decision (cost/credit metering, opt-in, regeneration cadence) and
// out of scope for this pass.
//
// Every threshold below is a named constant so they're easy to retune per
// what turns out to matter in practice.
// ============================================================

const THRESHOLDS = {
  agedBalanceAlertCents: 5_000_00, // any single client >90 days past due over this
  agedShareOfArAlertPct: 30, // (61-90 + 90+) as % of total open AR
  unusedPrepaymentCents: 1_000_00,
  unusedPaymentCents: 1_000_00,
  uninvoicedCents: 1_000_00,
  unassignedTicketsAlert: 5,
  revenuePaceBehindPct: 10, // % behind a pace-adjusted YTD target counts as caution
};

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

export function generateCompanyReportFlags(
  data: Pick<CompanyReportData, "collections" | "operations" | "kpis">,
  timeZone = "UTC",
  now = new Date()
): CompanyReportFlag[] {
  const flags: CompanyReportFlag[] = [];
  const { buckets, topBalances } = data.collections;
  const { unappliedPayments, prePayments, monthlyOps } = data.operations;

  // Largest aged balance
  const worstAged = topBalances.find((b) => b.d90PlusCents >= THRESHOLDS.agedBalanceAlertCents);
  if (worstAged) {
    flags.push({
      severity: "alert",
      title: `${worstAged.clientName} — ${money(worstAged.d90PlusCents)} over 90 days past due`,
      detail: "Largest single balance in the oldest aging bucket. Needs a payment plan or direct follow-up.",
    });
  }

  // AR concentration in the aged buckets
  const agedShare = buckets.totalCents > 0 ? ((buckets.d61_90Cents + buckets.d90PlusCents) / buckets.totalCents) * 100 : 0;
  if (agedShare >= THRESHOLDS.agedShareOfArAlertPct) {
    flags.push({
      severity: "caution",
      title: `${Math.round(agedShare)}% of open A/R is 61+ days past due`,
      detail: `${money(buckets.d61_90Cents + buckets.d90PlusCents)} of ${money(buckets.totalCents)} total outstanding is in the two oldest buckets.`,
    });
  } else if (buckets.totalCents > 0 && agedShare < 15) {
    flags.push({
      severity: "good",
      title: "A/R aging is healthy",
      detail: `Only ${Math.round(agedShare)}% of ${money(buckets.totalCents)} outstanding is 61+ days past due.`,
    });
  }

  // Unused pre-payments
  if (prePayments.unusedCents >= THRESHOLDS.unusedPrepaymentCents) {
    flags.push({
      severity: "caution",
      title: `${money(prePayments.unusedCents)} in unused pre-payments`,
      detail: "Money collected on account but not yet applied to an invoice. Apply it or confirm the pending work.",
    });
  }

  // Unused (unapplied) payments
  if (unappliedPayments.unusedCents >= THRESHOLDS.unusedPaymentCents) {
    flags.push({
      severity: "caution",
      title: `${money(unappliedPayments.unusedCents)} in unapplied payments`,
      detail: "Payments received with money still sitting unapplied to any invoice.",
    });
  }

  // Uninvoiced work (current month only — see MonthlyOpsRow.uninvoicedCents)
  const currentUninvoiced = monthlyOps.find((m) => m.uninvoicedCents !== null)?.uninvoicedCents;
  if (currentUninvoiced !== null && currentUninvoiced !== undefined && currentUninvoiced >= THRESHOLDS.uninvoicedCents) {
    flags.push({
      severity: "caution",
      title: `${money(currentUninvoiced)} in completed work not yet invoiced`,
      detail: "Services delivered but not billed. Identify and invoice.",
    });
  }

  // Unassigned tickets
  if (data.operations.tickets.unassignedOpen >= THRESHOLDS.unassignedTicketsAlert) {
    flags.push({
      severity: "caution",
      title: `${data.operations.tickets.unassignedOpen} unassigned open tickets`,
      detail: "Unassigned tickets risk falling through. Review and assign.",
    });
  }

  // Revenue pace vs annual target (only if a target is set on the KPI Scorecard)
  const { invoicedRevenueYtd } = data.kpis;
  if (invoicedRevenueYtd.valueCents !== null && invoicedRevenueYtd.targetDollars) {
    // Org calendar, not the server's UTC one — UTC rolls into the new year at
    // 7/8pm ET on Dec 31.
    const { year, month, day } = zoneDateParts(now, timeZone);
    const jan1 = `${year}-01-01`;
    const daysElapsed = daysBetweenYmd(jan1, ymd(year, month, day)) + 1;
    const daysInYear = daysBetweenYmd(jan1, `${year}-12-31`) + 1;
    const paceTargetCents = invoicedRevenueYtd.targetDollars * 100 * (daysElapsed / daysInYear);
    const paceBehindPct = paceTargetCents > 0 ? ((paceTargetCents - invoicedRevenueYtd.valueCents) / paceTargetCents) * 100 : 0;
    if (paceBehindPct >= THRESHOLDS.revenuePaceBehindPct) {
      flags.push({
        severity: "caution",
        title: `Revenue is behind pace toward the annual goal`,
        detail: `${money(invoicedRevenueYtd.valueCents)} invoiced YTD vs a pace-adjusted target of ${money(paceTargetCents)}.`,
      });
    } else if (paceBehindPct <= -5) {
      flags.push({
        severity: "good",
        title: "Revenue is ahead of pace toward the annual goal",
        detail: `${money(invoicedRevenueYtd.valueCents)} invoiced YTD vs a pace-adjusted target of ${money(paceTargetCents)}.`,
      });
    }
  }

  return flags;
}
