import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone, shiftYmd, isoInZone } from "@/lib/time/zone";
import { EMAIL_FROM } from "@/lib/email/send";
import { escapeHtml } from "@/lib/utils/escape-html";
import { logger } from "@/lib/logger";
import { resolveReminderRecipients } from "@/lib/notifications/reminder-recipients";
import { createOrgCanceledResolver } from "@/lib/orgs/org-canceled";

const log = logger.child("warranty-expiry-notify cron");

/** Days before a warranty ends that its owner is reminded. */
const REMINDER_WINDOW_DAYS = 30;

/**
 * GET /api/cron/warranty-expiry-notify — called daily by Vercel Cron.
 *
 * Finds active warranties ending within the next 30 days and tells the client's
 * sales rep ONCE per end date (crm_warranties.expiry_notified_for) so they can
 * offer a renewal. With no rep on the client, org admins get the in-app
 * notification only. Same shape as /api/cron/contract-expiry-notify.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */

const serviceClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();
  const now = new Date();
  // end_date is a calendar date, so the real window is each org's own. This cron
  // spans every org: widen the SQL bounds a day either side, re-filter per row
  // on that org's clock below.
  const lower = shiftYmd(isoInZone(now, "UTC"), -1);
  const upper = shiftYmd(isoInZone(now, "UTC"), REMINDER_WINDOW_DAYS + 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: expiring, error } = await (supabase as any)
    .from("crm_warranties")
    .select("id, org_id, name, end_date, client_id, clients(display_name, sales_rep_id), projects(name)")
    .eq("status", "active")
    .is("deleted_at", null)
    .gte("end_date", lower)
    .lte("end_date", upper);
  if (error) {
    log.error("could not load expiring warranties", { error });
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
  if (!expiring?.length) return NextResponse.json({ notified: 0 });

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
  let notified = 0;
  const orgCanceled = createOrgCanceledResolver(supabase);

  for (const w of expiring as Record<string, unknown>[]) {
    const endDate = w.end_date as string;
    const orgId = w.org_id as string;
    if (await orgCanceled(orgId)) continue; // canceled orgs get no automated reminders
    const orgToday = todayInZone(await getOrgTimeZone(supabase, orgId));
    if (endDate < orgToday || endDate > shiftYmd(orgToday, REMINDER_WINDOW_DAYS)) continue;

    // Claim this end date atomically so a repeat or overlapping run skips it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: claimed } = await (supabase as any)
      .from("crm_warranties")
      .update({ expiry_notified_for: endDate })
      .eq("id", w.id as string)
      .or(`expiry_notified_for.is.null,expiry_notified_for.neq.${endDate}`)
      .select("id");
    if (!claimed?.length) continue;

    const releaseClaim = async (reason: string, err?: unknown) => {
      log.error("warranty expiry notification failed; releasing claim for retry", {
        warrantyId: w.id, orgId, endDate, reason, err,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("crm_warranties")
        .update({ expiry_notified_for: null })
        .eq("id", w.id as string)
        .eq("expiry_notified_for", endDate);
    };

    const client = w.clients as { display_name?: string; sales_rep_id?: string | null } | null;
    const clientName = client?.display_name ?? "the client";
    const warrantyName = w.name as string;
    const projectName = (w.projects as { name?: string } | null)?.name ?? null;
    const daysLeft = Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${orgToday}T00:00:00Z`)) / 86_400_000,
    );
    const endLabel = new Date(`${endDate}T00:00:00`).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
    const title = `Warranty ${expiryPhrase(daysLeft)} — ${warrantyName}`;
    const message = `${warrantyName}${projectName ? ` (${projectName})` : ""} for ${clientName} ends on ${endLabel}. Reach out about a renewal before it lapses.`;
    const link = `${siteUrl}/crm/warranties`;

    try {
      // clients.sales_rep_id references crm_employees. If that rep is gone
      // (deleted/deactivated) or has no reachable login or email, the reminder
      // falls through to org admins — in-app AND email, per their prefs — so
      // it is never dropped (see resolveReminderRecipients).
      const { recipients } = await resolveReminderRecipients(supabase, {
        orgId,
        repEmployeeId: client?.sales_rep_id ?? null,
        clientId: (w.client_id as string | null) ?? null,
      });

      const inAppUserIds: string[] = [];
      const emailTargets: { email: string; firstName: string }[] = [];
      for (const r of recipients) {
        if (r.userId && r.prefs.inAppWarrantyExpiring !== false) inAppUserIds.push(r.userId);
        if (r.email && r.prefs.emailWarrantyExpiring !== false) emailTargets.push({ email: r.email, firstName: r.firstName });
      }
      if (recipients.length === 0) {
        // Nobody could be told: don't consume the claim, so a later run (after
        // a rep or admin is set up) can still send it.
        await releaseClaim("no reachable recipient");
        continue;
      }

      // The in-app row is inserted before the email, so a failed email releases
      // the claim and the next run retries. Skip users who already have this
      // reminder (same warranty, same message = same end date) so a retry
      // doesn't duplicate it.
      if (inAppUserIds.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (supabase as any)
          .from("notifications")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("type", "warranty_expiring")
          .eq("entity_id", w.id as string)
          .eq("message", message)
          .in("user_id", inAppUserIds);
        const already = new Set(((existing ?? []) as { user_id: string }[]).map((r) => r.user_id));
        for (let i = inAppUserIds.length - 1; i >= 0; i--) if (already.has(inAppUserIds[i])) inAppUserIds.splice(i, 1);
      }

      if (inAppUserIds.length) {
        const { error: notifErr } = await supabase.from("notifications").insert(
          inAppUserIds.map((userId) => ({
            org_id: orgId,
            user_id: userId,
            type: "warranty_expiring",
            title,
            message,
            entity_id: w.id as string,
            entity_type: "warranty",
          })),
        );
        if (notifErr) throw notifErr;
      }

      let emailFailed = false;
      for (const target of emailTargets) {
        const { error: sendErr } = await resend.emails.send({
          from: EMAIL_FROM,
          to: target.email,
          subject: title,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Warranty Expiring Soon</h2>
            <p style="margin:0 0 4px;color:#475569">Hi ${escapeHtml(target.firstName || "there")},</p>
            <p style="margin:0 0 24px;color:#475569">${escapeHtml(message)}</p>
            <a href="${link}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Warranties</a>
          </div>`,
        });
        if (sendErr) {
          await releaseClaim("email send failed", sendErr.message);
          emailFailed = true;
          break;
        }
      }
      if (emailFailed) continue;
      notified++;
    } catch (err) {
      await releaseClaim("notification threw", err);
    }
  }

  return NextResponse.json({ notified });
}

function expiryPhrase(daysLeft: number): string {
  if (daysLeft <= 0) return "expires today";
  if (daysLeft === 1) return "expires tomorrow";
  return `expires in ${daysLeft} days`;
}
