import { NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import { submitEstimateChangeRequest } from "@/lib/estimate-change-requests";
import { notifyStaffOfEstimateDecision } from "@/lib/estimate-client-notify";
import { recalcEstimateTotals } from "@/lib/estimate-calc";
import { isEstimatePastValidUntil } from "@/lib/estimates/validity";
import { recordAcceptedVersion } from "@/lib/estimates/versions";
import { isChangedSinceSent } from "@/lib/estimates/proposal-content";
import { logger } from "@/lib/logger";

const log = logger.child("portal-estimate-action");

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action, signatureName, message, acceptedLineItemIds, selectedTier } = await req.json() as {
    action: string;
    signatureName?: string;
    message?: string;
    acceptedLineItemIds?: string[];
    selectedTier?: string;
  };

  if (!["accept", "decline", "request_changes"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (action === "accept" && !signatureName?.trim()) {
    return NextResponse.json({ error: "Signature name is required to accept" }, { status: 400 });
  }
  if (action === "request_changes" && !message?.trim()) {
    return NextResponse.json({ error: "Please describe the changes you'd like" }, { status: 400 });
  }

  // acceptedLineItemIds gets interpolated directly into a PostgREST
  // .not("id","in", "(...)") filter string below — a malformed id containing
  // `)`, `,`, or quotes could break the intended filter or change which rows
  // match, so validate every entry is a real UUID before it's used anywhere.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    acceptedLineItemIds !== undefined &&
    (!Array.isArray(acceptedLineItemIds) ||
      acceptedLineItemIds.some((itemId) => typeof itemId !== "string" || !UUID_RE.test(itemId)))
  ) {
    return NextResponse.json({ error: "Invalid line item id" }, { status: 400 });
  }
  const TIERS = ["basic", "standard", "premium"] as const;
  if (selectedTier !== undefined && !TIERS.includes(selectedTier as (typeof TIERS)[number])) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Estimates nav is hidden client-side when disabled (PortalShell), but that's
  // not enforcement — a customer with a stale link could still POST here.
  // Only block if explicitly disabled; missing row = allowed, same semantics
  // as allow_tickets in src/app/api/portal/tickets/route.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (supabase as any)
    .from("client_portal_settings")
    .select("allow_estimates")
    .eq("org_id", ctx.orgId)
    .single() as { data: { allow_estimates: boolean } | null };

  if (settings !== null && settings?.allow_estimates === false) {
    return NextResponse.json({ error: "Estimates are not enabled for this portal" }, { status: 403 });
  }

  // Verify the estimate belongs to this client and is in an actionable state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estimate } = await (supabase as any)
    .from("estimates")
    .select("id, stage, org_id, client_id, estimate_number, sales_rep_id, valid_until_date, tiers_enabled")
    .eq("id", id)
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .single() as { data: { id: string; stage: string; org_id: string; client_id: string; estimate_number: number; sales_rep_id: string | null; valid_until_date: string | null; tiers_enabled: boolean | null } | null };

  if (!estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }
  if (estimate.stage !== "sent") {
    return NextResponse.json({ error: "Estimate is no longer actionable" }, { status: 409 });
  }
  // Same rule as the public proposal link: past Valid until, the client can
  // decline or ask for changes, but not accept the old price.
  if (action === "accept" && await isEstimatePastValidUntil(supabase, estimate.org_id, estimate.valid_until_date)) {
    return NextResponse.json(
      { error: "This estimate has expired. Request changes to get an updated one." },
      { status: 410 }
    );
  }
  if (action === "accept" && await isChangedSinceSent(supabase, estimate.id)) {
    return NextResponse.json(
      { error: "This estimate was updated after it was sent to you. We'll send you the latest version shortly." },
      { status: 409 }
    );
  }

  if (action === "request_changes") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: client } = await (supabase as any)
      .from("clients")
      .select("display_name")
      .eq("id", estimate.client_id)
      .single() as { data: { display_name: string } | null };

    await submitEstimateChangeRequest(supabase, {
      orgId: estimate.org_id,
      estimateId: estimate.id,
      clientId: estimate.client_id,
      estimateNumber: estimate.estimate_number,
      message: message!.trim(), // guarded above: request_changes requires a non-empty message
      requesterName: client?.display_name ?? ctx.email,
      requesterEmail: ctx.email,
    });
    return NextResponse.json({ success: true, status: "sent" });
  }

  // Work out which lines the acceptance wins/loses BEFORE the estimate is
  // claimed, so an invalid selection is rejected without leaving a
  // half-accepted estimate behind.
  //  - Only lines still at status 'quote' are eligible: a line staff already
  //    marked lost can't be revived by listing its id.
  //  - A tiered (Good/Better/Best) estimate is accepted for exactly ONE tier,
  //    same as the public proposal link. Untiered lines (tier null) are shared
  //    by every tier. Previously the portal preselected every line, so all
  //    three tiers were won and the recorded total was roughly tripled.
  let wonIds: string[] = [];
  let lostIds: string[] = [];
  if (action === "accept") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lineRows, error: linesErr } = await (supabase as any)
      .from("estimate_line_items")
      .select("id, status, tier, row_type")
      .eq("estimate_id", id)
      .is("deleted_at", null) as {
        data: { id: string; status: string; tier: string | null; row_type: string | null }[] | null;
        error: unknown;
      };
    if (linesErr) {
      log.error("failed to load line items", { estimateId: id, error: linesErr });
      return NextResponse.json({ error: "Failed to load estimate" }, { status: 500 });
    }
    const lines = lineRows ?? [];
    const tiersEnabled = estimate.tiers_enabled === true;
    const hasTieredLines = lines.some((li) => li.status === "quote" && li.tier !== null);
    if (tiersEnabled && hasTieredLines && !selectedTier) {
      return NextResponse.json({ error: "Please choose a package to accept" }, { status: 400 });
    }
    const inTier = (li: { tier: string | null }) =>
      !tiersEnabled || li.tier === null || li.tier === selectedTier;

    const byId = new Map(lines.map((li) => [li.id, li]));
    if (acceptedLineItemIds?.some((itemId) => !byId.has(itemId))) {
      return NextResponse.json({ error: "Invalid line item id" }, { status: 400 });
    }
    if (tiersEnabled && acceptedLineItemIds?.some((itemId) => !inTier(byId.get(itemId)!))) {
      return NextResponse.json({ error: "Selected items belong to more than one package" }, { status: 400 });
    }

    const eligible = lines.filter((li) => li.status === "quote");
    const accepted = acceptedLineItemIds ? new Set(acceptedLineItemIds) : null;
    const isWon = (li: { id: string; tier: string | null; row_type: string | null }) =>
      // Section headers carry no price; keep them with the accepted scope.
      li.row_type === "section" ? true : inTier(li) && (accepted ? accepted.has(li.id) : true);
    wonIds = eligible.filter(isWon).map((li) => li.id);
    lostIds = eligible.filter((li) => !isWon(li)).map((li) => li.id);

    const hasPricedEligible = eligible.some((li) => li.row_type !== "section");
    if (hasPricedEligible && !eligible.some((li) => li.row_type !== "section" && isWon(li))) {
      return NextResponse.json({ error: "Please select at least one item to accept" }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const patch =
    action === "accept"
      ? {
          stage: "accepted",
          portal_accepted_at: now,
          portal_signature_name: signatureName!.trim(), // guarded above: accept requires a signature name
          portal_user_id: ctx.userId,
        }
      : {
          // 'declined' is not a seeded estimate stage — a client turning the
          // proposal down is the same outcome the office records as 'lost'.
          stage: "lost",
          reason: "Declined by client via portal",
          portal_declined_at: now,
          portal_user_id: ctx.userId,
        };

  // Conditioned on stage still being "sent" (re-checked here, not just above)
  // so two concurrent submits (double-click, retry after a timeout) can't
  // both pass the stage check above and then both proceed — only the first
  // UPDATE actually matches a row; the second is a no-op we detect and
  // reject instead of continuing on to send duplicate confirmation emails
  // and fire duplicate automation triggers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (supabase as any)
    .from("estimates")
    .update({ ...patch, updated_at: now })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .eq("stage", "sent")
    .select("id");

  if (error) {
    console.error("[portal/estimates/action] Failed to update estimate:", error);
    return NextResponse.json({ error: "Failed to update estimate" }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "Estimate is no longer actionable" }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client } = await (supabase as any)
    .from("clients")
    .select("display_name")
    .eq("id", estimate.client_id)
    .single() as { data: { display_name: string } | null };

  await notifyStaffOfEstimateDecision(supabase, {
    orgId: estimate.org_id,
    estimateId: estimate.id,
    estimateNumber: estimate.estimate_number,
    salesRepId: estimate.sales_rep_id,
    clientName: client?.display_name ?? ctx.email,
    decision: action === "accept" ? "accepted" : "rejected",
  });

  // Per-line-item accept/reject — computed above. Both updates stay
  // conditioned on status 'quote' so nothing staff already decided changes.
  if (action === "accept") {
    if (wonIds.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("estimate_line_items")
        .update({ status: "won" })
        .eq("estimate_id", id)
        .eq("status", "quote")
        .in("id", wonIds)
        .is("deleted_at", null);
    }
    if (lostIds.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("estimate_line_items")
        .update({ status: "lost" })
        .eq("estimate_id", id)
        .eq("status", "quote")
        .in("id", lostIds)
        .is("deleted_at", null);
    }
  }

  if (action === "accept") {
    // Line items are now split into won/lost — recompute the estimate's
    // stored totals down to just the won subset (same as the token-based
    // public proposal accept route), so downstream invoicing/job-conversion
    // reflects what was actually accepted.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recalcEstimateTotals(supabase as any, id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordAcceptedVersion(supabase as any, id, signatureName!.trim(), "client_portal");
  }

  return NextResponse.json({ success: true, status: patch.stage });
}
