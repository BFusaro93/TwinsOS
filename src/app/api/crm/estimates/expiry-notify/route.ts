import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// Called daily by Vercel Cron (see vercel.json) — Vercel Cron always sends a
// GET request, so this must be GET, not POST, or it silently never fires.
// Finds estimates expiring in the next 3 days (not yet won/lost/expired) and
// emails the created_by user as an in-app notification proxy.

const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();
  const today = new Date();
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 3);

  const todayStr = today.toISOString().split("T")[0];
  const windowEndStr = windowEnd.toISOString().split("T")[0];

  // Estimates expiring in the next 3 days that are still open (sent or quote_ready stage)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: expiring } = await (supabase as any)
    .from("estimates")
    .select(`
      id, estimate_number, description, valid_until, total_cents, org_id, created_by,
      clients(display_name),
      organizations(name, brand_color)
    `)
    .gte("valid_until", todayStr)
    .lte("valid_until", windowEndStr)
    .in("stage", ["sent", "quote"])
    .is("deleted_at", null);

  if (!expiring?.length) {
    return NextResponse.json({ notified: 0 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  let notified = 0;

  for (const est of expiring as Record<string, unknown>[]) {
    const createdBy = est.created_by as string | null;
    if (!createdBy) continue;

    // Look up the rep's email from auth.users via profiles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("email, name, notification_prefs")
      .eq("id", createdBy)
      .single();

    if (!profile?.email) continue;
    const prefs = (profile.notification_prefs ?? {}) as Record<string, unknown>;
    if (prefs.emailEstimateExpiring === false) continue;

    const org = est.organizations as Record<string, unknown> | null;
    const client = est.clients as Record<string, unknown> | null;
    const orgName = (org?.name as string) ?? "Your Organization";
    const brandColor = (org?.brand_color as string) ?? "#60ab45";
    const estimateNum = String(est.estimate_number as number).padStart(5, "0");
    const clientName = (client?.display_name as string) ?? "Unknown Client";
    const validUntil = est.valid_until as string;
    const daysLeft = Math.ceil(
      (new Date(validUntil).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const totalFormatted = new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD",
    }).format((est.total_cents as number ?? 0) / 100);

    const html = buildExpiryEmail({
      orgName, brandColor, repName: profile.name ?? profile.email,
      clientName, estimateNum, validUntil, daysLeft, total: totalFormatted,
      estimateId: est.id as string,
    });

    try {
      await resend.emails.send({
        from: `${orgName} <noreply@twinslawnservice.com>`,
        to: profile.email,
        subject: `Estimate #${estimateNum} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — ${clientName}`,
        html,
      });
      notified++;
    } catch {
      // continue to next estimate if one email fails
    }
  }

  return NextResponse.json({ notified });
}

function buildExpiryEmail({
  orgName, brandColor, repName, clientName, estimateNum, validUntil,
  daysLeft, total, estimateId,
}: {
  orgName: string; brandColor: string; repName: string; clientName: string;
  estimateNum: string; validUntil: string; daysLeft: number; total: string;
  estimateId: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.twinsos.com";
  const estimateUrl = `${appUrl}/crm/estimates/${estimateId}`;
  const urgency = daysLeft <= 1 ? "⚠️ Expires today!" : `Expires in ${daysLeft} days`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:${brandColor};padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:20px">${orgName}</h1>
    <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:13px">Estimate Expiry Reminder</p>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;margin:0 0 16px">Hi ${repName},</p>
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px">
      A proposal you sent is expiring soon and hasn't been accepted yet.
    </p>
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-size:13px;font-weight:600;color:#92400e">
      ${urgency}
    </div>
    <div style="background:#f8fafc;border-radius:6px;padding:16px 20px;margin-bottom:20px">
      <table style="font-size:13px;width:100%">
        <tr><td style="color:#94a3b8;padding:3px 0">Client</td><td style="text-align:right;font-weight:600">${clientName}</td></tr>
        <tr><td style="color:#94a3b8;padding:3px 0">Estimate</td><td style="text-align:right;font-weight:600">#${estimateNum}</td></tr>
        <tr><td style="color:#94a3b8;padding:3px 0">Total</td><td style="text-align:right;font-weight:700;font-size:15px;color:${brandColor}">${total}</td></tr>
        <tr><td style="color:#94a3b8;padding:3px 0">Expires</td><td style="text-align:right">${new Date(validUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</td></tr>
      </table>
    </div>
    <a href="${estimateUrl}" style="display:inline-block;background:${brandColor};color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600">
      View Estimate →
    </a>
  </div>
  <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8">You received this because you created this estimate in ${orgName}.</p>
  </div>
</div>
</body></html>`;
}
