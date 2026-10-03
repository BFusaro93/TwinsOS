import { EMAIL_FROM_EQUIPT } from "@/lib/email/send";
import { escapeHtml } from "@/lib/utils/escape-html";
import { createServiceClient } from "@/lib/supabase/server";
import { fireEventAutomations, type AdminClient } from "@/lib/automations/cmms-automation-actions";
import { logger } from "@/lib/logger";

const log = logger.child("submit-work-request");

const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

function normalisePriority(raw: unknown): string {
  if (typeof raw !== "string") return "medium";
  const s = raw.trim().toLowerCase();
  return VALID_PRIORITIES.has(s) ? s : "medium";
}

function normaliseRepairTag(raw: unknown): boolean | null {
  if (raw === true || raw === "yes" || raw === "true") return true;
  if (raw === false || raw === "no" || raw === "false") return false;
  return null;
}

export interface WorkRequestInput {
  requestedBy: string;
  title: string;
  description?: string;
  priority?: string;
  equipment?: string;
  assetId?: string;
  equipmentType?: string;
  repairCategory?: string;
  hasRepairTag?: unknown;
}

/**
 * Shared insert + admin-notify logic for a maintenance request submitted via
 * either the public portal (Microsoft Forms / anonymous /request/[slug]) or
 * the internal authenticated field page (/photos/field/repair-request).
 * `createdBy`/`requestedById` are the acting user's profile id when the
 * submission is authenticated, or null for an anonymous submission — that's
 * the only thing that differs between the two callers.
 */
export async function submitWorkRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  org: { id: string },
  input: WorkRequestInput,
  attribution: { createdBy: string | null; requestedById: string | null }
): Promise<{ requestNumber: string; id: string }> {
  // Atomic per-org counter — the old `Date.now()` suffix collided whenever two
  // requests landed in the same few-ms window (or 100s later, wrapping at 5 digits).
  const { data: numberData, error: numberErr } = await supabase.rpc("next_entity_number", {
    p_entity_type: "maintenance_request",
    p_prefix: "MR",
    p_org_id_override: org.id,
  });
  if (numberErr || typeof numberData !== "string") {
    throw new Error(numberErr?.message ?? "Failed to allocate request number");
  }
  const requestNumber: string = numberData;

  // The public route resolves org from a slug and calls this with a
  // service-role client (bypasses RLS) — input.assetId is caller-supplied
  // and unvalidated, so without this check any caller could smuggle in a
  // UUID belonging to a DIFFERENT org's asset, writing a cross-tenant FK
  // into maintenance_requests.asset_id.
  let validatedAssetId: string | null = null;
  if (input.assetId) {
    const { data: asset } = await supabase
      .from("assets")
      .select("id")
      .eq("id", input.assetId)
      .eq("org_id", org.id)
      .maybeSingle();
    validatedAssetId = asset?.id ?? null;
  }

  const { data: mr, error: insertErr } = await supabase
    .from("maintenance_requests")
    .insert({
      org_id: org.id,
      request_number: requestNumber,
      title: input.title,
      description: input.description?.trim() || null,
      status: "open",
      priority: normalisePriority(input.priority),
      asset_id: validatedAssetId,
      asset_name: input.equipment?.trim() || null,
      requested_by_id: attribution.requestedById,
      requested_by_name: input.requestedBy,
      equipment_type: input.equipmentType?.trim() || null,
      repair_category: input.repairCategory?.trim() || null,
      has_repair_tag: normaliseRepairTag(input.hasRepairTag),
      created_by: attribution.createdBy,
      linked_work_order_id: null,
      linked_work_order_number: null,
    })
    .select("id, request_number")
    .single();

  if (insertErr) {
    throw new Error(insertErr.message ?? "Failed to create request");
  }

  // Notify admins/managers via email (best-effort — never fails the request)
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const { Resend } = await import("resend");
      const { data: recipients } = await supabase
        .from("profiles")
        .select("email, name, notification_prefs")
        .eq("org_id", org.id)
        .in("role", ["admin", "manager"]);

      const eligible = (recipients ?? []).filter((p: { email: string | null; notification_prefs: Record<string, unknown> | null }) => {
        if (!p.email) return false;
        const prefs = p.notification_prefs ?? {};
        return prefs["emailNewMaintenanceRequest"] !== false;
      });

      if (eligible.length > 0) {
        const resend = new Resend(resendKey);
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
        const subject = `New maintenance request: ${input.title}`;
        const link = `${siteUrl}/cmms/requests?id=${mr.id}`;

        await Promise.allSettled(
          eligible.map((p: { email: string; name: string | null }) =>
            resend.emails.send({
              from: EMAIL_FROM_EQUIPT,
              to: p.email,
              subject,
              html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
                <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">New Maintenance Request</h2>
                <p style="margin:0 0 4px;color:#475569">Hi ${escapeHtml(p.name ?? "there")},</p>
                <p style="margin:0 0 24px;color:#475569">${escapeHtml(input.requestedBy)} submitted: <strong>${escapeHtml(String(requestNumber))} — ${escapeHtml(input.title)}</strong>.</p>
                <a href="${link}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Review Request</a>
              </div>`,
            })
          )
        );
      }
    }
  } catch {
    // best-effort — don't fail the request
  }

  // Fire the org's request_submitted automations, same as an in-app
  // submission (useCreateRequest → /api/automations/run). That path only
  // runs from the browser, so portal / Microsoft Forms / field-crew requests
  // never triggered them. Service-role client: the actions create WOs /
  // requisitions / notifications org-wide, and the public caller has no
  // session. Scoped to the org this request was just filed under; the asset
  // id was validated against that org above. Best-effort — never fails the
  // request. The in-app path doesn't call this function, so nothing
  // double-fires.
  try {
    await fireEventAutomations(createServiceClient() as unknown as AdminClient, {
      orgId: org.id,
      eventTrigger: "request_submitted",
      assetId: validatedAssetId,
      assetName: input.equipment?.trim() || null,
      actorUserId: attribution.createdBy,
    });
  } catch (err) {
    log.error("request_submitted automations failed", { requestId: mr.id, error: err instanceof Error ? err.message : String(err) });
  }

  return { requestNumber: mr.request_number, id: mr.id };
}
