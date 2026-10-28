import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { EMAIL_FROM_EQUIPT, sendEmailRetryingRateLimit } from "@/lib/email/send";
import { escapeHtml } from "@/lib/utils/escape-html";
import { planIncludesModule } from "@/lib/stripe/plans";
import { logger } from "@/lib/logger";

/**
 * Shared plumbing for the Equipt alert digest crons (low stock, PM due, work
 * order overdue). The in-app side of these three alerts is derived live by the
 * notifications bell (use-notification-alerts.ts), so the crons only send the
 * EMAIL — they never insert notification rows, which would show up twice.
 *
 * Each recipient gets one digest listing the items they have not been emailed
 * about yet. "Not emailed yet" is tracked per user in equipt_alert_email_claims,
 * claimed BEFORE the send and released if the send fails.
 */

const log = logger.child("equipt-alert-digest");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClient = SupabaseClient<any, "public", any>;

export type AlertType = "low_stock" | "pm_due" | "work_order_overdue";
export type AlertEntityType = "part" | "product_item" | "pm_schedule" | "work_order";

export function serviceClient(): AnyClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export function isAuthorizedCron(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  return !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export interface DigestItem {
  entityType: AlertEntityType;
  entityId: string;
  /** Distinguishes one occurrence of the event from the next (see the migration). */
  eventKey: string;
  /** Plain-text line; escaped when rendered. */
  line: string;
}

export interface DigestRecipient {
  id: string;
  email: string;
  name: string | null;
  items: DigestItem[];
}

export interface DigestSpec {
  alertType: AlertType;
  /** profiles.notification_prefs key; `defaultOn` applies when the user never saved it. */
  prefKey: string;
  defaultOn: boolean;
  subject: (count: number) => string;
  heading: string;
  intro: (count: number) => string;
  ctaLabel: string;
  ctaPath: string;
}

const MAX_LISTED = 50;

/** Run in chunks so `.in()` lists stay inside PostgREST's URL limits. */
export async function inChunks<T, R>(values: T[], size: number, fn: (chunk: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < values.length; i += size) out.push(...(await fn(values.slice(i, i + size))));
  return out;
}

/**
 * Orgs (from `orgIds`) whose plan includes the Equipt module. Demo/sandbox orgs
 * (organizations.is_demo) and the platform staff org are excluded: their data
 * is fake and their logins are demo or support addresses, so a digest is noise
 * at best and a mail to a real person's inbox at worst.
 */
export async function loadEquiptOrgIds(supabase: AnyClient, orgIds: string[]): Promise<Set<string>> {
  const rows = await inChunks(orgIds, 100, async (chunk) => {
    const { data, error } = await supabase.from("organizations").select("id, plan, is_demo, is_platform_staff_org").in("id", chunk);
    if (error) throw error;
    return (data ?? []) as { id: string; plan: string | null; is_demo: boolean; is_platform_staff_org: boolean }[];
  });
  // A canceled org gets no background work (no digests), same rule as the other crons
  // (see src/lib/orgs/org-canceled.ts). planIncludesModule is checked first; canceled
  // plans are excluded explicitly rather than relying on that table's handling.
  return new Set(
    rows.filter((o) => !o.is_demo && !o.is_platform_staff_org && o.plan !== "canceled" && planIncludesModule(o.plan ?? "", "equipt")).map((o) => o.id)
  );
}

export interface OrgUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  prefs: Record<string, unknown>;
}

/** Active (not deactivated, not merely invited) users of an org with one of `roles`. */
export async function loadOrgUsers(supabase: AnyClient, orgId: string, roles: string[]): Promise<OrgUser[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, name, role, notification_prefs")
    .eq("org_id", orgId)
    .in("role", roles)
    .or("status.is.null,status.eq.active");
  if (error) throw error;
  return ((data ?? []) as { id: string; email: string | null; name: string | null; role: string; notification_prefs: Record<string, unknown> | null }[]).map(
    (p) => ({ id: p.id, email: p.email, name: p.name, role: p.role, prefs: p.notification_prefs ?? {} })
  );
}

/** True unless the user turned the preference off (or, for default-off prefs, never turned it on). */
export function prefEnabled(prefs: Record<string, unknown>, key: string, defaultOn: boolean): boolean {
  const v = prefs[key];
  return typeof v === "boolean" ? v : defaultOn;
}

async function claimItems(supabase: AnyClient, orgId: string, userId: string, alertType: AlertType, items: DigestItem[]): Promise<DigestItem[]> {
  const claimedKeys = new Set<string>();
  const key = (i: { entityType: string; entityId: string; eventKey: string }) => `${i.entityType}:${i.entityId}:${i.eventKey}`;
  // ignoreDuplicates + select() returns only the rows this call actually inserted.
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200);
    const { data, error } = await supabase
      .from("equipt_alert_email_claims")
      .upsert(
        chunk.map((it) => ({
          org_id: orgId,
          user_id: userId,
          alert_type: alertType,
          entity_type: it.entityType,
          entity_id: it.entityId,
          event_key: it.eventKey,
        })),
        { onConflict: "user_id,alert_type,entity_type,entity_id,event_key", ignoreDuplicates: true }
      )
      .select("entity_type, entity_id, event_key");
    if (error) throw error;
    for (const r of (data ?? []) as { entity_type: string; entity_id: string; event_key: string }[]) {
      claimedKeys.add(key({ entityType: r.entity_type, entityId: r.entity_id, eventKey: r.event_key }));
    }
  }
  return items.filter((it) => claimedKeys.has(key(it)));
}

async function releaseItems(supabase: AnyClient, userId: string, alertType: AlertType, items: DigestItem[]): Promise<void> {
  // Keyed on entity ids only: an older event key for the same entity would
  // just be re-claimed (and re-announced) harmlessly on the next run.
  const ids = Array.from(new Set(items.map((i) => i.entityId)));
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase
      .from("equipt_alert_email_claims")
      .delete()
      .eq("user_id", userId)
      .eq("alert_type", alertType)
      .in("entity_id", ids.slice(i, i + 100));
    if (error) log.error("could not release alert claims", { userId, alertType, error });
  }
}

function digestHtml(spec: DigestSpec, recipientName: string | null, items: DigestItem[], siteUrl: string): string {
  const listed = items.slice(0, MAX_LISTED);
  const more = items.length - listed.length;
  const rows = listed.map((i) => `<li style="margin:0 0 6px">${escapeHtml(i.line)}</li>`).join("");
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">${escapeHtml(spec.heading)}</h2>
    <p style="margin:0 0 4px;color:#475569">Hi ${escapeHtml(recipientName || "there")},</p>
    <p style="margin:0 0 16px;color:#475569">${escapeHtml(spec.intro(items.length))}</p>
    <ul style="margin:0 0 ${more > 0 ? 8 : 24}px;padding-left:20px;color:#475569">${rows}</ul>
    ${more > 0 ? `<p style="margin:0 0 24px;color:#475569">…and ${more} more.</p>` : ""}
    <a href="${escapeHtml(siteUrl + spec.ctaPath)}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">${escapeHtml(spec.ctaLabel)}</a>
  </div>`;
}

/**
 * Sends each recipient one digest of the items they haven't been told about.
 * Sequential on purpose (Resend rate limits). Returns how many emails went out.
 * Recipients' preference is checked by the caller via prefEnabled().
 */
export async function sendDigests(
  supabase: AnyClient,
  resend: Resend,
  orgId: string,
  spec: DigestSpec,
  recipients: DigestRecipient[]
): Promise<number> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
  let sent = 0;
  for (const r of recipients) {
    if (!r.email || r.items.length === 0) continue;
    let claimed: DigestItem[] = [];
    try {
      claimed = await claimItems(supabase, orgId, r.id, spec.alertType, r.items);
      if (claimed.length === 0) continue;
      const { error } = await sendEmailRetryingRateLimit(resend, {
        from: EMAIL_FROM_EQUIPT,
        to: r.email,
        subject: spec.subject(claimed.length),
        html: digestHtml(spec, r.name, claimed, siteUrl),
      });
      if (error) {
        log.error("alert digest email failed; releasing claims for retry", { orgId, userId: r.id, alertType: spec.alertType, error: error.message });
        await releaseItems(supabase, r.id, spec.alertType, claimed);
        continue;
      }
      sent++;
    } catch (err) {
      log.error("alert digest threw; releasing claims for retry", { orgId, userId: r.id, alertType: spec.alertType, err });
      if (claimed.length) await releaseItems(supabase, r.id, spec.alertType, claimed);
    }
  }
  return sent;
}

export function makeResend(): Resend {
  return new Resend(process.env.RESEND_API_KEY!);
}
