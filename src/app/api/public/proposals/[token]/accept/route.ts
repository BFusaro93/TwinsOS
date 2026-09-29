import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { recalcEstimateTotals } from "@/lib/estimate-calc";
import { notifyStaffOfEstimateDecision } from "@/lib/estimate-client-notify";
import { orgEmailFrom } from "@/lib/email/send";
import { logger } from "@/lib/logger";
import { escapeHtml } from "@/lib/utils/escape-html";
import { isEstimatePastValidUntil } from "@/lib/estimates/validity";
import { recordAcceptedVersion } from "@/lib/estimates/versions";
import { isChangedSinceSent } from "@/lib/estimates/proposal-content";

const log = logger.child("proposal-accept");

// A drawn signature arrives as a PNG data URL from the canvas. Cap the size so
// the column can't be abused as blob storage (a 520×120 signature is ~5-20KB).
const SIGNATURE_DATA_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const SIGNATURE_MAX_CHARS = 512 * 1024;

const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json() as {
    acceptedByName: string;
    signatureData?: string;
    acceptedLineItemIds?: string[];  // line item ids the client checked
    selectedTier?: string;           // tier chosen on the Good/Better/Best selector
    depositMethod?: 'cash' | 'check' | 'ach' | 'credit_card' | 'other';
    depositReference?: string;
    depositNotes?: string;
    depositAmount?: number;          // cents
  };

  if (!body.acceptedByName?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // The proposal page tells the client "By signing below … legally binding"
  // — an acceptance with a blank pad must not be recorded.
  const signature = body.signatureData?.trim() ?? "";
  if (!signature) {
    return NextResponse.json({ error: "Signature is required" }, { status: 400 });
  }
  if (signature.length > SIGNATURE_MAX_CHARS || !SIGNATURE_DATA_RE.test(signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // acceptedLineItemIds feeds a PostgREST `.in("id", ...)` filter below —
  // validate every entry is a real UUID before it's used anywhere.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (body.acceptedLineItemIds?.some((id) => !UUID_RE.test(id))) {
    return NextResponse.json({ error: "Invalid line item id" }, { status: 400 });
  }

  // selectedTier is interpolated into a PostgREST `.or()` filter below, whose
  // grammar is comma-separated terms inside parentheses. An unvalidated value
  // therefore adds terms to the disjunction rather than supplying one: a tier
  // of `basic,id.not.is.null` widens "tier is null OR tier = basic" to "…OR
  // every row", so a client accepting the cheapest tier silently wins the
  // premium lines too, and the matching `.neq()` below leaves them un-lost.
  // The column's own CHECK already limits it to these three, so rejecting
  // anything else costs nothing.
  const TIERS = ["basic", "standard", "premium"] as const;
  if (body.selectedTier && !TIERS.includes(body.selectedTier as (typeof TIERS)[number])) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const supabase = serviceClient();
  const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;

  // Validate token
  const { data: shareToken, error: tokenErr } = await supabase
    .from("estimate_share_tokens")
    .select("*")
    .eq("token", token)
    .is("deleted_at", null)
    .single();

  if (tokenErr || !shareToken) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }
  if (shareToken.accepted_at) {
    return NextResponse.json({ error: "Already accepted" }, { status: 409 });
  }
  if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
    return NextResponse.json({ error: "Proposal link has expired" }, { status: 410 });
  }

  // The token's own accepted_at only guards against replaying THIS token —
  // it says nothing about whether staff moved the estimate on since the link
  // was sent (e.g. marked it declined/lost, or it was invoiced under a
  // different tier). Re-check the estimate's current stage too, same as the
  // logged-in portal's own accept route (api/portal/estimates/[id]/action).
  const { data: currentEstimate } = await supabase
    .from("estimates")
    .select("stage, total_cents, valid_until_date, tiers_enabled")
    .eq("id", shareToken.estimate_id)
    .is("deleted_at", null)
    .single();
  if (!currentEstimate || currentEstimate.stage !== "sent") {
    return NextResponse.json({ error: "This proposal is no longer actionable" }, { status: 409 });
  }
  // A Good/Better/Best proposal is accepted for exactly one tier. Without a
  // tier the fallback below would win every quote line — all three tiers.
  if (currentEstimate.tiers_enabled && !body.selectedTier) {
    const { count: tieredCount } = await supabase
      .from("estimate_line_items")
      .select("id", { count: "exact", head: true })
      .eq("estimate_id", shareToken.estimate_id)
      .eq("status", "quote")
      .is("deleted_at", null)
      .not("tier", "is", null);
    if ((tieredCount ?? 0) > 0) {
      return NextResponse.json({ error: "Please choose a package to accept" }, { status: 400 });
    }
  }
  if (await isEstimatePastValidUntil(supabase, shareToken.org_id, currentEstimate.valid_until_date)) {
    return NextResponse.json(
      { error: "This proposal has expired. Use Request changes to ask for an updated one." },
      { status: 410 }
    );
  }

  // The client can only accept the version their link shows. If staff have
  // edited past it, accepting would apply terms the client never saw.
  if (await isChangedSinceSent(supabase, shareToken.estimate_id)) {
    return NextResponse.json(
      { error: "This proposal was updated after it was sent to you. We'll send you the latest version shortly." },
      { status: 409 }
    );
  }

  // The deposit block is anyone-with-the-link input and had no validation at
  // all — the TypeScript cast on `body` above is erased at runtime. An
  // arbitrary depositAmount was written straight to an integer cents column,
  // so a decimal ("100.50") threw, and because the update's error was never
  // checked the request still returned 200 with the deposit silently dropped.
  // A caller could equally claim a deposit far larger than the job.
  const DEPOSIT_METHODS = new Set(["cash", "check", "ach", "credit_card", "other"]);
  let depositAmountCents: number | null = null;
  if (body.depositMethod !== undefined || body.depositAmount !== undefined) {
    if (!body.depositMethod || !DEPOSIT_METHODS.has(body.depositMethod)) {
      return NextResponse.json({ error: "Invalid deposit method" }, { status: 400 });
    }
    if (
      typeof body.depositAmount !== "number" ||
      !Number.isInteger(body.depositAmount) ||
      body.depositAmount <= 0
    ) {
      return NextResponse.json({ error: "Deposit amount must be a whole number of cents" }, { status: 400 });
    }
    // A deposit is a down payment on this job; it can never exceed it. That
    // is checked below against the ACCEPTED total (after the won/lost split
    // and recalc) — the pre-acceptance total_cents is the wrong basis: it
    // still includes lines the client unticks, and on a Good/Better/Best
    // estimate it is priced on one tier while the client may pick another.
    depositAmountCents = body.depositAmount;
  }
  const depositReference = body.depositReference?.slice(0, 200) ?? null;
  const depositNotes = body.depositNotes?.slice(0, 2000) ?? null;

  const now = new Date().toISOString();

  // 1. Mark token as accepted — conditioned on accepted_at still being null so
  // two concurrent submits (double-click, retry after a timeout) can't both
  // pass the read check above and then both proceed: only the first UPDATE
  // actually matches a row, the second is a no-op we detect and reject,
  // instead of both continuing on to send duplicate confirmation emails and
  // fire duplicate automation triggers.
  const { data: claimed, error: claimErr } = await supabase
    .from("estimate_share_tokens")
    .update({
      accepted_at: now,
      accepted_by_name: body.acceptedByName.trim(),
      signature_data: signature,
      ip_address: ipAddress,
    })
    .eq("id", shareToken.id)
    .is("accepted_at", null)
    .select("id");
  if (claimErr) {
    return NextResponse.json({ error: "Failed to record acceptance" }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: "Already accepted" }, { status: 409 });
  }

  // 2. Move estimate stage → accepted
  // Conditional on stage='sent' so staff marking it lost mid-request isn't
  // overwritten; on failure the token claim is released so the link isn't
  // burned while the estimate stays 'sent'.
  const { data: stageMoved, error: stageErr } = await supabase
    .from("estimates")
    .update({ stage: "accepted", updated_at: now })
    .eq("id", shareToken.estimate_id)
    .eq("stage", "sent")
    .select("id");
  if (stageErr || !stageMoved || stageMoved.length === 0) {
    await supabase
      .from("estimate_share_tokens")
      .update({ accepted_at: null })
      .eq("id", shareToken.id);
    return NextResponse.json(
      { error: stageErr ? "Failed to record acceptance" : "This proposal is no longer actionable" },
      { status: stageErr ? 500 : 409 }
    );
  }

  // Undo a claimed acceptance when a later step fails, so the client can
  // retry instead of being left with a burned link on an estimate that is
  // 'accepted' but only half split / priced on the wrong scope. Only lines
  // this request moved are reset; the estimate goes back to 'sent' only if
  // it is still the 'accepted' this request set; totals are recomputed from
  // the restored open lines.
  const rollbackAcceptance = async (touchedLineIds: string[]) => {
    if (touchedLineIds.length) {
      await supabase
        .from("estimate_line_items")
        .update({ status: "quote" })
        .eq("estimate_id", shareToken.estimate_id)
        .in("id", touchedLineIds)
        .in("status", ["won", "lost"]);
    }
    await supabase
      .from("estimates")
      .update({ stage: "sent", updated_at: new Date().toISOString() })
      .eq("id", shareToken.estimate_id)
      .eq("stage", "accepted");
    await supabase
      .from("estimate_share_tokens")
      .update({ accepted_at: null, accepted_by_name: null, signature_data: null, ip_address: null })
      .eq("id", shareToken.id);
    try {
      await recalcEstimateTotals(supabase, shareToken.estimate_id);
    } catch (err) {
      log.error("failed to recalc totals after acceptance rollback", {
        error: err instanceof Error ? err.message : err,
        estimateId: shareToken.estimate_id,
      });
    }
  };

  // 3. Update line items → won/lost based on tier selection and explicit id
  // list. The split is computed here in TS and applied with `.in()` — the old
  // `.not("id","in", "('a','b')")` filter quoted each uuid, PostgREST kept the
  // quotes as part of the value, the uuid cast failed (22P02) and, because
  // the error was never checked, unticked lines silently stayed 'quote' and
  // were billed as accepted.
  const { data: openLines, error: openLinesErr } = await supabase
    .from("estimate_line_items")
    .select("id, tier, row_type")
    .eq("estimate_id", shareToken.estimate_id)
    .eq("status", "quote")
    .is("deleted_at", null);
  if (openLinesErr) {
    log.error("failed to load line items for acceptance", {
      error: openLinesErr,
      estimateId: shareToken.estimate_id,
    });
    await rollbackAcceptance([]);
    return NextResponse.json({ error: "Failed to record acceptance" }, { status: 500 });
  }
  const eligibleLines = (openLines ?? []) as { id: string; tier: string | null; row_type: string | null }[];
  const acceptedIds = body.acceptedLineItemIds?.length ? new Set(body.acceptedLineItemIds) : null;
  const isWonLine = (li: { id: string; tier: string | null; row_type: string | null }) => {
    if (body.selectedTier) {
      // Tier-based: items with tier=null OR tier=selectedTier → won; other tiers → lost
      return li.tier === null || li.tier === body.selectedTier;
    }
    if (acceptedIds) {
      // Section headers carry no price and are never offered as a checkbox;
      // keep them with the accepted scope (same as the portal accept route).
      return li.row_type === "section" || acceptedIds.has(li.id);
    }
    // No specific selection — mark all quote items won
    return true;
  };
  const wonIds = eligibleLines.filter(isWonLine).map((li) => li.id);
  const lostIds = eligibleLines.filter((li) => !isWonLine(li)).map((li) => li.id);

  for (const [ids, status] of [[wonIds, "won"], [lostIds, "lost"]] as const) {
    if (ids.length === 0) continue;
    const { error: lineErr } = await supabase
      .from("estimate_line_items")
      .update({ status })
      .eq("estimate_id", shareToken.estimate_id)
      .in("id", ids)
      // Only still-open lines: a line staff marked lost can't be revived.
      .eq("status", "quote")
      .is("deleted_at", null);
    if (lineErr) {
      log.error("failed to split line items on acceptance", {
        error: lineErr,
        estimateId: shareToken.estimate_id,
        status,
      });
      await rollbackAcceptance([...wonIds, ...lostIds]);
      return NextResponse.json({ error: "Failed to record acceptance" }, { status: 500 });
    }
  }

  // 3b. Line items are now split into won/lost — recompute the estimate's
  // stored totals down to just the won subset, so the confirmation email
  // below and any later invoice/job-conversion reflect what was actually
  // accepted, not the full pre-acceptance (e.g. all-tiers) total. This
  // re-applies the estimate-level discount rule (percent re-derived from the
  // won subtotal, flat clamped) and taxes the discounted amount — the same
  // figures the public page displayed, so the recorded total_cents is the
  // amount the client actually accepted.
  let acceptedTotalCents: number;
  try {
    await recalcEstimateTotals(supabase, shareToken.estimate_id);
    const { data: recalced, error: recalcReadErr } = await supabase
      .from("estimates")
      .select("total_cents")
      .eq("id", shareToken.estimate_id)
      .single();
    if (recalcReadErr || !recalced) throw recalcReadErr ?? new Error("estimate not found after recalc");
    acceptedTotalCents = (recalced.total_cents as number | null) ?? 0;
  } catch (err) {
    log.error("failed to recalc totals on acceptance", {
      error: err instanceof Error ? err.message : err,
      estimateId: shareToken.estimate_id,
    });
    await rollbackAcceptance([...wonIds, ...lostIds]);
    return NextResponse.json({ error: "Failed to record acceptance" }, { status: 500 });
  }

  // 3c. A deposit is a down payment on the accepted scope; it can never
  // exceed it. Checked against the post-split total, and the acceptance is
  // undone (not half-recorded) so the client can correct the amount.
  if (depositAmountCents !== null && depositAmountCents > acceptedTotalCents) {
    await rollbackAcceptance([...wonIds, ...lostIds]);
    return NextResponse.json({ error: "Deposit amount exceeds the proposal total" }, { status: 400 });
  }

  // 3d. Record the deposit the client says they are sending.
  //
  // This is a CLAIM, not money received: the client picks a method and types
  // an amount on the proposal page, and nothing is charged. So it is recorded
  // for staff to chase and reconcile — deliberately NOT turned into a
  // crm_payments row or an invoice credit, which would book money that may
  // never arrive. It is also not yet deducted from what the job invoices; see
  // the note below.
  if (depositAmountCents !== null) {
    const { error: depositErr } = await supabase
      .from("estimates")
      .update({
        deposit_method: body.depositMethod,
        deposit_reference: depositReference,
        deposit_notes: depositNotes,
        deposit_collected_cents: depositAmountCents,
        deposit_collected_at: now,
      })
      .eq("id", shareToken.estimate_id);
    // Previously unchecked, so a rejected write (e.g. a non-integer amount)
    // was invisible: the client saw their deposit accepted and no record of it
    // existed. The acceptance itself is already committed and must stand, so
    // this logs loudly rather than failing the request.
    if (depositErr) {
      log.error("failed to record proposal deposit", {
        error: depositErr,
        estimateId: shareToken.estimate_id,
        depositAmountCents,
      });
    }
  }

  await recordAcceptedVersion(supabase, shareToken.estimate_id, body.acceptedByName.trim(), "proposal_link");

  // 4. Log to client_activity
  const { data: est } = await supabase
    .from("estimates")
    .select("client_id, estimate_number, org_id, total_cents, sales_rep_id, clients(primary_email, display_name)")
    .eq("id", shareToken.estimate_id)
    .single();

  if (est) {
    await notifyStaffOfEstimateDecision(supabase, {
      orgId: est.org_id,
      estimateId: shareToken.estimate_id,
      estimateNumber: est.estimate_number as number,
      salesRepId: (est.sales_rep_id as string | null) ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientName: ((est.clients as any)?.display_name as string | undefined) ?? body.acceptedByName.trim(),
      decision: "accepted",
    });
  }

  if (est?.client_id) {
    const tierNote = body.selectedTier ? ` Accepted tier: ${body.selectedTier}.` : "";
    await supabase.from("client_activity").insert({
      org_id: est.org_id,
      client_id: est.client_id,
      activity_type: "estimate",
      subject: `Estimate #${est.estimate_number} accepted online`,
      body: `Accepted by ${body.acceptedByName.trim()} via View My Proposal portal.${tierNote}`,
      ref_id: shareToken.estimate_id,
      ref_table: "estimates",
      occurred_at: now,
    });
  }

  // 5. Send confirmation email to client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRow = est?.clients as any;
  const clientEmail = clientRow?.primary_email as string | null;
  const clientName = clientRow?.display_name as string | null;

  if (clientEmail && est) {
    const { data: org } = await supabase
      .from("organizations")
      .select("name, brand_color, address")
      .eq("id", est.org_id)
      .single();

    const orgName = org?.name ?? "Your Service Provider";
    const brandColor = (org?.brand_color as string) ?? "#60ab45";
    const orgPhone = ((org?.address as Record<string, string>) ?? {}).phone ?? "";

    const totalFormatted = new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD",
    }).format((est.total_cents ?? 0) / 100);

    const confirmHtml = buildConfirmationEmail({
      orgName,
      brandColor,
      orgPhone,
      clientName: clientName ?? body.acceptedByName,
      estimateNumber: est.estimate_number as number,
      total: totalFormatted,
      acceptedByName: body.acceptedByName,
    });

    try {
      const resend = new Resend(process.env.RESEND_API_KEY!);
      const { data: sent } = await resend.emails.send({
        from: orgEmailFrom(orgName),
        to: clientEmail,
        subject: `You accepted Estimate #${est.estimate_number} — ${orgName}`,
        html: confirmHtml,
      });

      // Log the confirmation email
      await supabase.from("estimate_emails").insert({
        org_id: est.org_id,
        estimate_id: shareToken.estimate_id,
        to_email: clientEmail,
        to_name: clientName ?? null,
        subject: `You accepted Estimate #${est.estimate_number} — ${orgName}`,
        body_html: confirmHtml,
        resend_id: sent?.id ?? null,
        email_type: "confirmation",
      });
    } catch (err) {
      // Don't fail the accept flow if the confirmation email fails
      log.error("confirmation email error", {
        estimateId: shareToken.estimate_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Echo the recorded (post-recalc, discount-and-tax-applied) total so the
  // client sees the same figure that was stored.
  return NextResponse.json({ ok: true, totalCents: est?.total_cents ?? null });
}

function buildConfirmationEmail(raw: {
  orgName: string; brandColor: string; orgPhone: string; clientName: string;
  estimateNumber: number; total: string; acceptedByName: string;
}) {
  // Every value here can come from the anonymous proposal-link submitter
  // (acceptedByName) or from freeform org/client fields — escape them all.
  const orgName = escapeHtml(raw.orgName);
  const brandColor = /^#[0-9a-fA-F]{3,8}$/.test(raw.brandColor) ? raw.brandColor : "#60ab45";
  const orgPhone = escapeHtml(raw.orgPhone);
  const clientName = escapeHtml(raw.clientName);
  const acceptedByName = escapeHtml(raw.acceptedByName);
  const total = escapeHtml(raw.total);
  const { estimateNumber } = raw;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:${brandColor};padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:20px">${orgName}</h1>
    <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:13px">Proposal Accepted ✓</p>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;margin:0 0 16px">Hi ${clientName},</p>
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px">
      Thank you for accepting <strong>Estimate #${String(estimateNumber).padStart(5, "0")}</strong>.
      We have received your confirmation and will be in touch soon to schedule your services.
    </p>
    <div style="background:#f8fafc;border-radius:6px;padding:16px 20px;margin-bottom:20px">
      <table style="font-size:13px;width:100%">
        <tr><td style="color:#94a3b8;padding:3px 0">Estimate</td><td style="text-align:right;font-weight:600">#${String(estimateNumber).padStart(5, "0")}</td></tr>
        <tr><td style="color:#94a3b8;padding:3px 0">Total</td><td style="text-align:right;font-weight:700;font-size:15px;color:${brandColor}">${total}</td></tr>
        <tr><td style="color:#94a3b8;padding:3px 0">Accepted by</td><td style="text-align:right">${acceptedByName}</td></tr>
      </table>
    </div>
    <p style="font-size:13px;color:#64748b;margin:0">
      Questions? Call us at <strong>${orgPhone || orgName}</strong>.
    </p>
  </div>
  <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8">${orgName}</p>
  </div>
</div>
</body></html>`;
}
