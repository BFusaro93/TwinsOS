import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { recalcEstimateTotals } from "@/lib/estimate-calc";
import { notifyStaffOfEstimateDecision } from "@/lib/estimate-client-notify";

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

  // acceptedLineItemIds gets interpolated directly into a PostgREST
  // .not("id","in", "(...)") filter string below — a malformed id containing
  // `)`, `,`, or quotes could break the intended filter or change which rows
  // match, so validate every entry is a real UUID before it's used anywhere.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (body.acceptedLineItemIds?.some((id) => !UUID_RE.test(id))) {
    return NextResponse.json({ error: "Invalid line item id" }, { status: 400 });
  }

  const supabase = serviceClient();
  const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;

  // Validate token
  const { data: shareToken, error: tokenErr } = await supabase
    .from("estimate_share_tokens")
    .select("*")
    .eq("token", token)
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
    .select("stage")
    .eq("id", shareToken.estimate_id)
    .single();
  if (!currentEstimate || currentEstimate.stage !== "sent") {
    return NextResponse.json({ error: "This proposal is no longer actionable" }, { status: 409 });
  }

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
      signature_data: body.signatureData ?? null,
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
  await supabase
    .from("estimates")
    .update({ stage: "accepted", updated_at: now })
    .eq("id", shareToken.estimate_id);

  // 2b. Record deposit if provided
  if (body.depositMethod && body.depositAmount && body.depositAmount > 0) {
    await supabase
      .from("estimates")
      .update({
        deposit_method: body.depositMethod,
        deposit_reference: body.depositReference ?? null,
        deposit_notes: body.depositNotes ?? null,
        deposit_collected_cents: body.depositAmount,
        deposit_collected_at: now,
      })
      .eq("id", shareToken.estimate_id);
  }

  // 3. Update line items → won/lost based on tier selection and explicit id list
  if (body.selectedTier) {
    // Tier-based: items with tier=null OR tier=selectedTier → won; other tiers → lost
    await supabase
      .from("estimate_line_items")
      .update({ status: "won" })
      .eq("estimate_id", shareToken.estimate_id)
      .eq("status", "quote")
      .is("deleted_at", null)
      .or(`tier.is.null,tier.eq.${body.selectedTier}`);

    await supabase
      .from("estimate_line_items")
      .update({ status: "lost" })
      .eq("estimate_id", shareToken.estimate_id)
      .eq("status", "quote")
      .is("deleted_at", null)
      .not("tier", "is", null)
      .neq("tier", body.selectedTier);
  } else if (body.acceptedLineItemIds?.length) {
    await supabase
      .from("estimate_line_items")
      .update({ status: "won" })
      .eq("estimate_id", shareToken.estimate_id)
      .in("id", body.acceptedLineItemIds)
      .is("deleted_at", null);

    await supabase
      .from("estimate_line_items")
      .update({ status: "lost" })
      .eq("estimate_id", shareToken.estimate_id)
      .not("id", "in", `(${body.acceptedLineItemIds.map((id) => `'${id}'`).join(",")})`)
      .eq("status", "quote")
      .is("deleted_at", null);
  } else {
    // No specific selection — mark all quote items won
    await supabase
      .from("estimate_line_items")
      .update({ status: "won" })
      .eq("estimate_id", shareToken.estimate_id)
      .eq("status", "quote")
      .is("deleted_at", null);
  }

  // 3b. Line items are now split into won/lost — recompute the estimate's
  // stored totals down to just the won subset, so the confirmation email
  // below and any later invoice/job-conversion reflect what was actually
  // accepted, not the full pre-acceptance (e.g. all-tiers) total.
  await recalcEstimateTotals(supabase, shareToken.estimate_id);

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
        from: `${orgName} <noreply@twinslawnservice.com>`,
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
      console.error("[proposal-accept] confirmation email error:", err);
    }
  }

  return NextResponse.json({ ok: true });
}

function buildConfirmationEmail({
  orgName, brandColor, orgPhone, clientName, estimateNumber, total, acceptedByName,
}: {
  orgName: string; brandColor: string; orgPhone: string; clientName: string;
  estimateNumber: number; total: string; acceptedByName: string;
}) {
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
