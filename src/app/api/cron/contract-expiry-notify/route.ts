import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { EMAIL_FROM } from "@/lib/email/send";

/**
 * GET /api/cron/contract-expiry-notify — called daily by Vercel Cron.
 *
 * Finds contracts ending in the next 3 days (still active) and emails the
 * contract's sales rep — same shape as /api/crm/estimates/expiry-notify, but
 * keyed off `sales_rep_id` (contracts' owner field) rather than `created_by`
 * (which is what the estimate cron uses, since these two features ended up
 * with different owner columns).
 *
 * Previously excluded auto_renew=true contracts on the assumption those
 * renew themselves — but no code anywhere actually extends a contract's
 * end_date or performs a renewal, so that exclusion meant an auto_renew
 * contract would reach its end date, silently stop being billed (the
 * invoicing cron correctly requires status IN ('signed','active') and
 * doesn't care about auto_renew), and nobody would ever be told it lapsed.
 * Notify for every expiring contract regardless of auto_renew until real
 * auto-renewal exists.
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
    .is("deleted_at", null);

  if (!expiring?.length) {
    return NextResponse.json({ notified: 0 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  let notified = 0;

  for (const contract of expiring as Record<string, unknown>[]) {
    const contractClientId = contract.client_id as string | null;
    if (contractClientId) {
      await fireSimpleTrigger(supabase, {
        orgId: contract.org_id as string,
        clientId: contractClientId,
        triggerType: "contract_about_to_expire",
      });
    }

    const repId = contract.sales_rep_id as string | null;
    if (!repId) continue;

    // contracts.sales_rep_id references crm_employees, not profiles — an
    // employee's email/name live there directly regardless of whether they
    // have a login. notification_prefs (and the notifications table's
    // user_id) only exist for a linked profiles row, so those are looked up
    // separately via crm_employees.user_id when present.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rep } = await (supabase as any)
      .from("crm_employees")
      .select("user_id, email, first_name, last_name")
      .eq("id", repId)
      .single();
    if (!rep) continue;

    let prefs: Record<string, unknown> = {};
    if (rep.user_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("notification_prefs")
        .eq("id", rep.user_id)
        .single();
      prefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
    }
    const repName = `${rep.first_name ?? ""} ${rep.last_name ?? ""}`.trim();

    const clientName = (contract.clients as Record<string, unknown> | null)?.display_name as string ?? "the client";
    const endDate = contract.end_date as string;
    const daysLeft = Math.ceil((new Date(endDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const contractUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com"}/crm/accounting/contracts`;

    if (rep.user_id && prefs.inAppContractExpiring !== false) {
      await (supabase as any)
        .from("notifications")
        .insert({
          org_id: contract.org_id,
          user_id: rep.user_id,
          type: "contract_expiring",
          title: `Contract Expiring Soon — ${contract.title}`,
          message: `${contract.title} for ${clientName} ends on ${new Date(endDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Renew it or follow up with the client before it lapses.`,
          entity_id: contract.id,
          entity_type: "contract",
        });
    }

    if (!rep.email || prefs.emailContractExpiring === false) continue;

    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: rep.email,
        subject: `Contract expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — ${contract.title}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Contract Expiring Soon</h2>
          <p style="margin:0 0 4px;color:#475569">Hi ${repName || "there"},</p>
          <p style="margin:0 0 24px;color:#475569"><strong>${contract.title}</strong> for ${clientName} ends on ${new Date(endDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Renew it or follow up with the client before it lapses.</p>
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
