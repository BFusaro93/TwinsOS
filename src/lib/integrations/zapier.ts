import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import type { TriggerType } from "@/types/crm-automations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>;

const log = logger.child("zapier");

/** Landscapt/CRM trigger types exposed to Zapier — a subset of crm-automations' TriggerType. */
export const ZAPIER_CRM_TRIGGER_TYPES = [
  "client_created",
  "lead_created",
  "lead_converted_to_client",
  "client_cancelled",
  "estimate_created",
  "estimate_won",
  "estimate_lost",
  "job_created",
  "ticket_created",
  "ticket_closed",
  "invoice_created",
  "invoice_paid",
  "contract_signed",
  "damage_case_created",
  "visit_dispatched",
] as const satisfies readonly TriggerType[];

/**
 * Equipt/CMMS trigger types exposed to Zapier. Unlike the CRM side, CMMS has
 * no single "fire this trigger type" dispatch chokepoint (its mutations
 * write to Supabase directly from the browser) — these are plain string
 * literals, not drawn from an existing CMMS trigger-type union. Most are
 * polling-only (see zapier-triggers.ts); work_order_completed and po_approved
 * additionally get REST Hook push piggybacked on the wo_status_change /
 * po_status_change round-trip that /api/automations/run already receives.
 * meter_threshold is polling-only by design — Zapier passes meterId/
 * threshold/operator as query params (the Zap author configures which meter
 * and what threshold when setting up the trigger), same idea as the
 * internal automations engine's per-automation meter_threshold config, but
 * evaluated per-request instead of stored server-side.
 */
export const ZAPIER_CMMS_TRIGGER_TYPES = [
  "asset_created",
  "work_order_created",
  "work_order_completed",
  "requisition_created",
  "po_created",
  "po_approved",
  "pm_schedule_due",
  "part_low_stock",
  "vendor_created",
  "meter_threshold",
] as const;

export const ZAPIER_TRIGGER_TYPES = [
  ...ZAPIER_CRM_TRIGGER_TYPES,
  ...ZAPIER_CMMS_TRIGGER_TYPES,
] as const;

export type ZapierCrmTriggerType = (typeof ZAPIER_CRM_TRIGGER_TYPES)[number];
export type ZapierCmmsTriggerType = (typeof ZAPIER_CMMS_TRIGGER_TYPES)[number];
export type ZapierTriggerType = (typeof ZAPIER_TRIGGER_TYPES)[number];

export function isZapierTriggerType(value: string): value is ZapierTriggerType {
  return (ZAPIER_TRIGGER_TYPES as readonly string[]).includes(value);
}

export function adminClient(): AdminClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export function generateZapierApiKey(): string {
  return `zap_${randomBytes(24).toString("hex")}`;
}

/**
 * Resolves the calling org from the `Authorization: Bearer <key>` header
 * against integrations.api_key (provider = 'zapier'). Mirrors the CRON_SECRET
 * bearer-token pattern used elsewhere (e.g. samsara/sync) but keyed per-org
 * instead of a single shared secret, since each org issues its own key.
 */
export async function authenticateZapierRequest(
  request: Request,
  db: AdminClient
): Promise<{ orgId: string; integrationId: string } | null> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;
  const key = match[1].trim();
  if (!key) return null;

  const { data } = await db
    .from("integrations")
    .select("id, org_id")
    .eq("provider", "zapier")
    .eq("api_key", key)
    .eq("enabled", true)
    .maybeSingle();

  if (!data) return null;
  return { orgId: data.org_id as string, integrationId: data.id as string };
}

/**
 * Delivers a trigger event to every Zapier subscription this org has
 * registered for that trigger type. Best-effort / fire-and-forget from the
 * caller's perspective — failures are logged, never thrown, so a Zap outage
 * never blocks the internal event that triggered delivery (mirrors how
 * fireSimpleTrigger itself is called from mutation hooks).
 */
export async function notifyZapierSubscribers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  triggerType: ZapierTriggerType,
  payload: Record<string, unknown>
): Promise<void> {
  const { data: subscriptions } = await db
    .from("zapier_webhook_subscriptions")
    .select("id, target_url")
    .eq("org_id", orgId)
    .eq("trigger_type", triggerType)
    .is("deleted_at", null);

  if (!subscriptions || subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub: { id: string; target_url: string }) => {
      try {
        const res = await fetch(sub.target_url as string, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          log.warn("subscriber webhook rejected", {
            subscriptionId: sub.id,
            triggerType,
            status: res.status,
          });
        }
      } catch (err) {
        log.error("subscriber webhook delivery failed", {
          subscriptionId: sub.id,
          triggerType,
          err,
        });
      }
    })
  );
}
