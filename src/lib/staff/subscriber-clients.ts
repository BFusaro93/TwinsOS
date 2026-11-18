import "server-only";
import { logger } from "@/lib/logger";
import { getPlanConfig, isBillablePlan } from "@/lib/stripe/plans";

/**
 * Mirrors every subscriber org as a client (and every demo request as a lead) inside the platform
 * staff org (organizations.is_platform_staff_org), so staff can run marketing, automations and
 * tickets against subscribers with the same CRM they sell.
 *
 * The org is the source of truth; the client is a projection. The link lives on
 * organizations.staff_client_id (service-role write only — see protect_stripe_billing_columns) and
 * nothing on the client points back at the tenant. Every function here takes a SERVICE-ROLE client
 * and never throws: a failed sync is logged and must never block signup, checkout or a webhook.
 *
 * Lifecycle -> clients.status:
 *   trial (no subscription yet) ........ lead
 *   paid plan ......................... active   (fires the lead -> client conversion)
 *   canceled / unpaid / paused ........ cancelled
 * An account that has been a client can't be set back to a lead (enforce_client_status_transition),
 * so a desired "lead" never downgrades an existing active/cancelled client.
 */

const log = logger.child("subscriber-clients");

/** Source labels staff can filter on in the Leads / Clients lists. */
export const SUBSCRIBER_SOURCE = "Landscapt signup";
export const DEMO_REQUEST_SOURCE = "Demo request";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type SubscriberContact = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type OrgRow = {
  id: string;
  name: string;
  plan: string;
  trial_ends_at: string | null;
  stripe_subscription_status: string | null;
  is_demo: boolean | null;
  is_platform_staff_org: boolean | null;
  staff_client_id: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase() ?? "";
  return EMAIL_RE.test(v) && v.length <= 254 ? v : null;
}

/** The staff org that owns subscriber clients, or null when none is flagged. */
export async function getStaffOrgId(db: Db): Promise<string | null> {
  const { data } = await db
    .from("organizations")
    .select("id")
    .eq("is_platform_staff_org", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

function splitName(full: string | null | undefined): { first: string; last: string | null } | null {
  const v = full?.trim().replace(/\s+/g, " ") ?? "";
  if (!v) return null;
  const i = v.indexOf(" ");
  return i === -1 ? { first: v.slice(0, 80), last: null } : { first: v.slice(0, i).slice(0, 80), last: v.slice(i + 1).slice(0, 80) };
}

/** A trial with no end date never expires (use-trial-status): a comped / own-use org, not a prospect. */
function isOpenEnded(org: OrgRow): boolean {
  return org.plan === "trial" && !org.trial_ends_at;
}

function planLabel(org: OrgRow): string {
  if (isOpenEnded(org)) return "Open-ended access";
  if (org.plan === "trial") return "Trial";
  if (org.plan === "canceled") return "Canceled";
  return isBillablePlan(org.plan) ? getPlanConfig(org.plan).label : org.plan;
}

function desiredStatus(org: OrgRow): "lead" | "active" | "cancelled" {
  if (org.plan === "canceled") return "cancelled";
  if (org.plan === "trial" && !isOpenEnded(org)) return "lead";
  return "active";
}

/** One-line summary stored as the timeline entry; also the dedupe key for "did anything change". */
function activitySubject(org: OrgRow): string {
  const status = desiredStatus(org);
  const stage = status === "lead" ? "trial" : status === "active" ? "subscribed" : "canceled";
  return `Subscription: ${planLabel(org)} (${stage})`;
}

async function logActivity(db: Db, staffOrgId: string, clientId: string, org: OrgRow, body: string | null): Promise<void> {
  const subject = activitySubject(org);
  // Skip when the latest entry for this org already says the same thing — makes a retried
  // webhook or a re-run backfill a no-op instead of a duplicate timeline row.
  const { data: last } = await db
    .from("client_activity")
    .select("subject")
    .eq("client_id", clientId)
    .eq("ref_table", "organizations")
    .eq("ref_id", org.id)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((last as { subject: string | null } | null)?.subject === subject) return;
  const { error } = await db.from("client_activity").insert({
    org_id: staffOrgId,
    client_id: clientId,
    activity_type: "note",
    subject,
    body,
    ref_table: "organizations",
    ref_id: org.id,
  });
  if (error) log.warn("could not log subscriber activity", { orgId: org.id, error: error.message });
}

/** Signup contact when the caller has none: the org's oldest active admin. */
async function resolveContact(db: Db, orgId: string, given?: SubscriberContact): Promise<SubscriberContact> {
  const contact: SubscriberContact = { ...given };
  if (cleanEmail(contact.email) && contact.name) return contact;
  const { data: admin } = await db
    .from("profiles")
    .select("name, email")
    .eq("org_id", orgId)
    .eq("role", "admin")
    .neq("status", "inactive")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const a = admin as { name: string | null; email: string | null } | null;
  return { name: contact.name || a?.name, email: contact.email || a?.email, phone: contact.phone };
}

/**
 * Creates or updates the staff-org client that mirrors `orgId`. Returns the client id, or null when
 * the org is skipped (demo / staff org / no staff org flagged) or the sync failed.
 */
export async function syncSubscriberClient(
  db: Db,
  orgId: string,
  opts: { contact?: SubscriberContact; reason?: string } = {}
): Promise<string | null> {
  try {
    const { data: org } = (await db
      .from("organizations")
      .select("id, name, plan, trial_ends_at, stripe_subscription_status, is_demo, is_platform_staff_org, staff_client_id")
      .eq("id", orgId)
      .maybeSingle()) as { data: OrgRow | null };
    if (!org || org.is_demo === true || org.is_platform_staff_org === true) return null;

    const staffOrgId = await getStaffOrgId(db);
    if (!staffOrgId || staffOrgId === org.id) return null;

    const status = desiredStatus(org);
    const reason = opts.reason ?? null;

    // ── Existing link: update status when it moves, then log the change. ──
    if (org.staff_client_id) {
      const { data: existing } = await db
        .from("clients")
        .select("id, status, deleted_at")
        .eq("id", org.staff_client_id)
        .eq("org_id", staffOrgId)
        .maybeSingle();
      const client = existing as { id: string; status: string; deleted_at: string | null } | null;
      if (client && !client.deleted_at) {
        const isLeadish = client.status === "lead" || client.status === "lost";
        // Never push an account that has been a client back to a lead (DB rejects it anyway).
        const next = status === "lead" && !isLeadish ? client.status : status;
        if (next !== client.status) {
          const patch: Record<string, unknown> = { status: next };
          if (next === "cancelled") {
            patch.closed_at = new Date().toISOString();
            patch.cancellation_reason = reason ?? "Subscription canceled";
          } else if (client.status === "cancelled") {
            patch.closed_at = null;
            patch.cancellation_reason = null;
          }
          const { error } = await db.from("clients").update(patch).eq("id", client.id);
          if (error) throw error;
        }
        await logActivity(db, staffOrgId, client.id, org, reason);
        return client.id;
      }
      // Link points at a deleted/missing client: fall through and re-create it.
    }

    // ── No usable link: adopt a matching lead (e.g. a demo request) or create a client. ──
    const contact = await resolveContact(db, org.id, opts.contact);
    const email = cleanEmail(contact.email);

    let clientId: string | null = null;
    if (email) {
      // A demo-request lead for the same address becomes this subscriber instead of a duplicate.
      const { data: lead } = await db
        .from("clients")
        .select("id, status")
        .eq("org_id", staffOrgId)
        .is("deleted_at", null)
        .ilike("primary_email", email.replace(/[%_\\]/g, (c) => `\\${c}`))
        .in("status", ["lead", "lost"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const found = lead as { id: string; status: string } | null;
      if (found) {
        // Link first so a failed status update can't leave a second client behind on retry.
        const { error: linkErr } = await db.from("organizations").update({ staff_client_id: found.id }).eq("id", org.id);
        if (linkErr) throw linkErr;
        const patch: Record<string, unknown> = { display_name: org.name, source: SUBSCRIBER_SOURCE };
        if (status !== "lead") patch.status = status;
        else if (found.status === "lost") patch.status = "lead";
        await db.from("clients").update(patch).eq("id", found.id);
        clientId = found.id;
      }
    }

    if (!clientId) {
      const { data: created, error: insErr } = await db
        .from("clients")
        .insert({
          org_id: staffOrgId,
          display_name: org.name.slice(0, 200),
          account_type: "commercial",
          status,
          source: SUBSCRIBER_SOURCE,
          primary_email: email,
          billing_email: email,
          primary_phone: contact.phone?.trim().slice(0, 30) || null,
          // Existing customers of the product: email is fine (every campaign carries an
          // unsubscribe link); SMS is never opted in from here — the A2P campaign is Twins'.
          ok_to_email: true,
          do_not_market: false,
          sms_opt_in: false,
        })
        .select("id")
        .single();
      if (insErr || !created) throw insErr ?? new Error("client insert returned no row");
      clientId = (created as { id: string }).id;

      const { error: linkErr } = await db.from("organizations").update({ staff_client_id: clientId }).eq("id", org.id);
      if (linkErr) {
        // Don't leave an unlinked duplicate for the next attempt to trip over.
        await db.from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", clientId);
        throw linkErr;
      }

      const person = splitName(contact.name);
      if (person) {
        await db.from("client_contacts").insert({
          org_id: staffOrgId,
          client_id: clientId,
          first_name: person.first,
          last_name: person.last,
          email,
          phone: contact.phone?.trim().slice(0, 30) || null,
          contact_type: "owner",
          is_primary: true,
          ok_to_email: true,
          sms_opt_in: false,
        });
      }
    }

    await logActivity(db, staffOrgId, clientId, org, reason);
    return clientId;
  } catch (err) {
    log.error("subscriber client sync failed", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export type DemoRequest = {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  /** ISO start time when the demo is a booked meeting (Calendly); logs "Demo booked" instead. */
  scheduledFor?: string | null;
};

/**
 * Records a demo request as a lead in the staff org. A repeat request from the same address adds a
 * timeline entry to the existing lead/client instead of creating a second record.
 */
export async function createDemoRequestLead(
  db: Db,
  req: DemoRequest
): Promise<{ clientId: string; created: boolean } | null> {
  const staffOrgId = await getStaffOrgId(db);
  if (!staffOrgId) return null;
  const email = cleanEmail(req.email);
  if (!email) return null;

  const { data: existing } = await db
    .from("clients")
    .select("id")
    .eq("org_id", staffOrgId)
    .is("deleted_at", null)
    .ilike("primary_email", email.replace(/[%_\\]/g, (c) => `\\${c}`))
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const note =
    [
      req.scheduledFor ? `Scheduled for ${req.scheduledFor}` : null,
      req.message?.trim(),
      req.phone?.trim() ? `Phone: ${req.phone.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n") || null;
  const subject = req.scheduledFor ? "Demo booked" : "Demo requested";
  let clientId = (existing as { id: string } | null)?.id ?? null;
  const created = !clientId;

  if (!clientId) {
    const { data: row, error } = await db
      .from("clients")
      .insert({
        org_id: staffOrgId,
        display_name: req.companyName.slice(0, 200),
        account_type: "commercial",
        status: "lead",
        source: DEMO_REQUEST_SOURCE,
        primary_email: email,
        billing_email: email,
        primary_phone: req.phone?.trim().slice(0, 30) || null,
        ok_to_email: true,
        do_not_market: false,
        sms_opt_in: false,
      })
      .select("id")
      .single();
    if (error || !row) {
      log.error("demo request lead insert failed", { error: error?.message });
      return null;
    }
    clientId = (row as { id: string }).id;
    const person = splitName(req.contactName);
    if (person) {
      await db.from("client_contacts").insert({
        org_id: staffOrgId,
        client_id: clientId,
        first_name: person.first,
        last_name: person.last,
        email,
        phone: req.phone?.trim().slice(0, 30) || null,
        contact_type: "owner",
        is_primary: true,
        ok_to_email: true,
        sms_opt_in: false,
      });
    }
  }

  // Webhook retries must not stack duplicate timeline rows.
  const { data: lastAct } = await db
    .from("client_activity")
    .select("subject, body")
    .eq("client_id", clientId)
    .eq("subject", subject)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastAct && (lastAct as { body: string | null }).body === note) return { clientId, created };

  const { error: actErr } = await db.from("client_activity").insert({
    org_id: staffOrgId,
    client_id: clientId,
    activity_type: "note",
    subject,
    body: note,
  });
  if (actErr) log.warn("could not log demo request activity", { error: actErr.message });
  return { clientId, created };
}
