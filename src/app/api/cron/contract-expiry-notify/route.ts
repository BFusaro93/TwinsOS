import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

/**
 * GET /api/cron/contract-expiry-notify — called daily by Vercel Cron.
 *
 * Finds contracts ending in the next 3 days (still active, not auto-renewing)
 * and emails the contract's sales rep — same shape as
 * /api/crm/estimates/expiry-notify, but keyed off `sales_rep_id` (contracts'
 * owner field) rather than `created_by` (which is what the estimate cron
 * uses, since these two features ended up with different owner columns).
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */

const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();
  const today = new Date();
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 3);
  const todayStr = today.toISOString().split("T")[0];
  const windowEndStr = windowEnd.toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: expiring } = await (supabase as any)
    .from("crm_contracts")
    .select("id, org_id, title, end_date, sales_rep_id, client_id, clients(display_name)")
    .gte("end_date", todayStr)
    .lte("end_date", windowEndStr)
    .eq("is_active", true)
    .eq("auto_renew", false)
    .is("deleted_at", null);

  if (!expiring?.length) {
    return NextResponse.json({ notified: 0 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  let notified = 0;

  for (const contract of expiring as Record<string, unknown>[]) {
    const repId = contract.sales_rep_id as string | null;
    if (!repId) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rep } = await (supabase as any)
      .from("profiles")
      .select("id, email, name, notification_prefs")
      .eq("id", repId)
      .single();
    if (!rep) continue;
    const prefs = (rep.notification_prefs ?? {}) as Record<string, unknown>;

    const clientName = (contract.clients as Record<string, unknown> | null)?.display_name as string ?? "the client";
    const endDate = contract.end_date as string;
    const daysLeft = Math.ceil((new Date(endDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const contractUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://twins-os.vercel.app"}/crm/accounting/contracts`;

    if (prefs.inAppContractExpiring !== false) {
      await (supabase as any)
        .from("notifications")
        .insert({
          org_id: contract.org_id,
          user_id: rep.id,
          type: "contract_expiring",
          title: `Contract Expiring Soon — ${contract.title}`,
          message: `${contract.title} for ${clientName} ends on ${new Date(endDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} and isn't set to auto-renew.`,
          entity_id: contract.id,
          entity_type: "contract",
        });
    }

    if (!rep.email || prefs.emailContractExpiring === false) continue;

    try {
      await resend.emails.send({
        from: "Equipt <noreply@twinslawnservice.com>",
        to: rep.email,
        subject: `Contract expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — ${contract.title}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Contract Expiring Soon</h2>
          <p style="margin:0 0 4px;color:#475569">Hi ${rep.name ?? "there"},</p>
          <p style="margin:0 0 24px;color:#475569"><strong>${contract.title}</strong> for ${clientName} ends on ${new Date(endDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} and isn't set to auto-renew.</p>
          <a href="${contractUrl}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Contracts</a>
        </div>`,
      });
      notified++;
    } catch {
      // continue to next contract if one email fails
    }
  }

  return NextResponse.json({ notified });
}
