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
  const requestNumber = `MR-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

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
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://twins-os.vercel.app";
        const subject = `New maintenance request: ${input.title}`;
        const link = `${siteUrl}/cmms/requests?id=${mr.id}`;

        await Promise.allSettled(
          eligible.map((p: { email: string; name: string | null }) =>
            resend.emails.send({
              from: "Equipt <noreply@twinslawnservice.com>",
              to: p.email,
              subject,
              html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
                <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">New Maintenance Request</h2>
                <p style="margin:0 0 4px;color:#475569">Hi ${p.name ?? "there"},</p>
                <p style="margin:0 0 24px;color:#475569">${input.requestedBy} submitted: <strong>${requestNumber} — ${input.title}</strong>.</p>
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

  return { requestNumber: mr.request_number, id: mr.id };
}
