import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone, shiftYmd, isoInZone } from "@/lib/time/zone";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { EMAIL_FROM } from "@/lib/email/send";
import { escapeHtml } from "@/lib/utils/escape-html";
import { logger } from "@/lib/logger";
import { resolveReminderRecipients } from "@/lib/notifications/reminder-recipients";
import { createOrgCanceledResolver } from "@/lib/orgs/org-canceled";

const log = logger.child("contract-expiry-notify cron");

/**
 * GET /api/cron/contract-expiry-notify — called daily by Vercel Cron.
 *
 * Finds contracts ending in the next 3 days (still active) and emails the
 * contract's sales rep ONCE per end date (expiry_notified_for) — same shape as /api/crm/estimates/expiry-notify, but
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
  // end_date is a calendar date, so the real window is each org's own 3-day
  // window. This cron spans every org, so widen the SQL bounds by a day either
  // side and re-filter per row on that org's clock below — a bare UTC lower
  // bound drops contracts ending on an org's own today.
  const todayStr = shiftYmd(isoInZone(today, "UTC"), -1);
  const windowEndStr = shiftYmd(isoInZone(windowEnd, "UTC"), 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: expiring } = await (supabase as any)
    .from("crm_contracts")
    .select("id, org_id, title, end_date, sales_rep_id, client_id, clients(display_name)")
    .gte("end_date", todayStr)
    .lte("end_date", windowEndStr)
    .eq("is_active", true)
    // Only contracts that are actually in force: cancelling or expiring a
    // contract leaves is_active true, so without this a cancelled (or
    // still-draft) contract nearing its end date told the rep to "renew it"
    // and enrolled the CLIENT in the contract_about_to_expire automation.
    .in("status", ["signed", "active"])
    .is("deleted_at", null);

  if (!expiring?.length) {
    return NextResponse.json({ notified: 0 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  let notified = 0;
  const orgCanceled = createOrgCanceledResolver(supabase);

  for (const contract of expiring as Record<string, unknown>[]) {
    // Re-filter on the org's calendar — the SQL bounds above are deliberately
    // a day wider than the real window.
    if (await orgCanceled(contract.org_id as string)) continue; // canceled orgs get no automated reminders
    const orgToday = todayInZone(await getOrgTimeZone(supabase, contract.org_id as string));
    const endDate = contract.end_date as string | null;
    if (!endDate) continue;
    if (endDate < orgToday || endDate > shiftYmd(orgToday, 3)) continue;

    // One reminder per contract end date: claim it atomically before doing
    // anything, so a repeat run (or an overlapping one) skips this contract.
    // Renewing changes end_date, which re-arms the reminder for the new date.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: claimed } = await (supabase as any)
      .from("crm_contracts")
      .update({ expiry_notified_for: endDate })
      .eq("id", contract.id as string)
      .or(`expiry_notified_for.is.null,expiry_notified_for.neq.${endDate}`)
      .select("id");
    if (!claimed?.length) continue;

    // The claim above is taken before anything is sent; if the automation or
    // the rep email then fails, give the claim back (only if it still holds
    // this end date) so tomorrow's run retries instead of never notifying.
    // Re-firing the automation on retry is safe: isEligibleForEnrollment
    // won't re-enroll a client whose enrollment is still in flight.
    const releaseClaim = async (reason: string, error?: unknown) => {
      log.error("contract expiry notification failed; releasing claim for retry", {
        contractId: contract.id, orgId: contract.org_id, endDate, reason, error,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("crm_contracts")
        .update({ expiry_notified_for: null })
        .eq("id", contract.id as string)
        .eq("expiry_notified_for", endDate);
    };

    const contractClientId = contract.client_id as string | null;
    if (contractClientId) {
      try {
        await fireSimpleTrigger(supabase, {
          orgId: contract.org_id as string,
          clientId: contractClientId,
          triggerType: "contract_about_to_expire",
        });
      } catch (err) {
        await releaseClaim("automation trigger failed", err);
        continue;
      }
    }

    // contracts.sales_rep_id references crm_employees. A rep who has since been
    // deleted/deactivated (or has no reachable login or email) is skipped: the
    // reminder goes to the client's account manager, then to org admins, so it
    // is never silently dropped. notification_prefs live on the linked login.
    const { recipients } = await resolveReminderRecipients(supabase, {
      orgId: contract.org_id as string,
      repEmployeeId: contract.sales_rep_id as string | null,
      clientId: contractClientId,
    });
    if (recipients.length === 0) {
      await releaseClaim("no reachable recipient");
      continue;
    }

    const clientName = (contract.clients as Record<string, unknown> | null)?.display_name as string ?? "the client";
    const contractTitle = (contract.title as string | null) ?? "Contract";
    // Titles/client names are user-entered — escape them for the email HTML
    // (the in-app notification and subject stay raw text).
    const safeTitle = escapeHtml(contractTitle);
    const safeClientName = escapeHtml(clientName);
    // Whole calendar days on the org's clock — a UTC-midnight parse minus the
    // current instant floored to 0 for a contract ending today.
    const daysLeft = Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${orgToday}T00:00:00Z`)) / 86_400_000
    );
    const contractUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com"}/crm/accounting/contracts`;

    let emailFailed = false;
    let emailedAny = false;
    // A retry (after a failed email released the claim) must not stack a second
    // in-app row on the users who already got this reminder: same contract +
    // same message = same end date.
    const inAppMessage = `${contract.title} for ${clientName} ends on ${new Date(endDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Renew it or follow up with the client before it lapses.`;
    const inAppUserIds = recipients
      .filter((r) => r.userId && r.prefs.inAppContractExpiring !== false)
      .map((r) => r.userId as string);
    if (inAppUserIds.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: alreadyNotified } = await (supabase as any)
        .from("notifications")
        .select("user_id")
        .eq("org_id", contract.org_id as string)
        .eq("type", "contract_expiring")
        .eq("entity_id", contract.id as string)
        .eq("message", inAppMessage)
        .in("user_id", inAppUserIds);
      const already = new Set(((alreadyNotified ?? []) as { user_id: string }[]).map((n) => n.user_id));
      for (const userId of inAppUserIds) {
        if (already.has(userId)) continue;
        await supabase
          .from("notifications")
          .insert({
            org_id: contract.org_id,
            user_id: userId,
            type: "contract_expiring",
            title: `Contract Expiring Soon — ${contract.title}`,
            message: inAppMessage,
            entity_id: contract.id,
            entity_type: "contract",
          });
      }
    }

    for (const r of recipients) {
      if (!r.email || r.prefs.emailContractExpiring === false) continue;
      try {
        const { error: sendErr } = await resend.emails.send({
          from: EMAIL_FROM,
          to: r.email,
          subject: `Contract ${expiryPhrase(daysLeft)} — ${contract.title}`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Contract Expiring Soon</h2>
          <p style="margin:0 0 4px;color:#475569">Hi ${escapeHtml(r.firstName || "there")},</p>
          <p style="margin:0 0 24px;color:#475569"><strong>${safeTitle}</strong> for ${safeClientName} ends on ${new Date(endDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Renew it or follow up with the client before it lapses.</p>
          <a href="${contractUrl}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Contracts</a>
        </div>`,
        });
        if (sendErr) {
          await releaseClaim("email send failed", sendErr.message);
          emailFailed = true;
          break;
        }
        emailedAny = true;
      } catch (err) {
        // continue to next contract if one email fails
        await releaseClaim("email send threw", err);
        emailFailed = true;
        break;
      }
    }
    if (!emailFailed && emailedAny) notified++;
  }

  return NextResponse.json({ notified });
}

/** "expires today" / "expires tomorrow" / "expires in N days" — daysLeft is a
 *  whole-day count on the org's calendar, so 0 means today, not "0 days". */
function expiryPhrase(daysLeft: number): string {
  if (daysLeft <= 0) return "expires today";
  if (daysLeft === 1) return "expires tomorrow";
  return `expires in ${daysLeft} days`;
}
