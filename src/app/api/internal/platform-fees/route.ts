import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const log = logger.child("internal platform fees");

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  orgId: z.string().uuid(),
  // Basis points of the amount charged (10 = 0.1%). Capped at 1% by a DB CHECK too.
  platformFeeBps: z.number().int().min(0).max(100),
});

/** bps → "0.10%" */
function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: isStaff } = await supabase.rpc("is_staff", { uid: user.id });
  if (!isStaff) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

/** Staff-only: every org with its current platform fee and Stripe Connect status. */
export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  // ?orgId=… returns that org's full rate-change history (newest first).
  const historyOrgId = new URL(request.url).searchParams.get("orgId");
  if (historyOrgId) {
    if (!z.string().uuid().safeParse(historyOrgId).success) {
      return NextResponse.json({ error: "Invalid orgId" }, { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: entries, error: historyError } = await (createServiceClient().from("audit_log") as any)
      .select("id, changed_by_name, description, created_at")
      .eq("org_id", historyOrgId)
      .eq("record_type", "organization")
      .eq("field_changed", "platform_fee_bps")
      .order("created_at", { ascending: false })
      .limit(200);
    if (historyError) {
      log.error("failed to load fee history", { error: historyError, orgId: historyOrgId });
      return NextResponse.json({ error: "Couldn't load history" }, { status: 500 });
    }
    return NextResponse.json({
      history: (entries ?? []).map(
        (e: { id: string; changed_by_name: string | null; description: string | null; created_at: string }) => ({
          id: e.id,
          by: e.changed_by_name,
          description: e.description,
          at: e.created_at,
        })
      ),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (createServiceClient().from("organizations") as any)
    .select("id, name, platform_fee_bps, stripe_connect_account_id, stripe_connect_charges_enabled")
    .order("name");
  if (error) {
    log.error("failed to list orgs", { error });
    return NextResponse.json({ error: "Couldn't load organizations" }, { status: 500 });
  }

  const service = createServiceClient();
  // Users per org, so the page can hide empty duplicate/abandoned orgs.
  // Paged: a single select stops at the API's 1000-row cap and undercounts past it.
  const userCounts = new Map<string, number>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profileRows, error: profileErr } = await (service.from("profiles") as any)
      .select("org_id")
      .order("id")
      .range(from, from + PAGE - 1);
    if (profileErr) {
      log.error("failed to count users per org", { error: profileErr });
      break;
    }
    for (const r of (profileRows ?? []) as { org_id: string | null }[]) {
      if (r.org_id) userCounts.set(r.org_id, (userCounts.get(r.org_id) ?? 0) + 1);
    }
    if ((profileRows ?? []).length < PAGE) break;
  }
  // Newest fee change per org, from the audit trail.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: auditRows } = await (service.from("audit_log") as any)
    .select("org_id, changed_by_name, description, created_at")
    .eq("record_type", "organization")
    .eq("field_changed", "platform_fee_bps")
    .order("created_at", { ascending: false })
    .limit(1000);
  const lastChange = new Map<string, { by: string | null; at: string; description: string | null }>();
  for (const r of (auditRows ?? []) as {
    org_id: string;
    changed_by_name: string | null;
    description: string | null;
    created_at: string;
  }[]) {
    if (!lastChange.has(r.org_id)) lastChange.set(r.org_id, { by: r.changed_by_name, at: r.created_at, description: r.description });
  }

  return NextResponse.json({
    orgs: (data ?? []).map(
      (o: {
        id: string;
        name: string;
        platform_fee_bps: number;
        stripe_connect_account_id: string | null;
        stripe_connect_charges_enabled: boolean | null;
      }) => ({
        id: o.id,
        name: o.name,
        platformFeeBps: o.platform_fee_bps,
        stripeConnected: !!o.stripe_connect_account_id && !!o.stripe_connect_charges_enabled,
        userCount: userCounts.get(o.id) ?? 0,
        lastChange: lastChange.get(o.id) ?? null,
      })
    ),
  });
}

/** Staff-only: set one org's platform fee. Applies to charges created after the change. */
export async function PATCH(request: Request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { orgId, platformFeeBps } = parsed.data;

  const service = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: before } = await (service.from("organizations") as any)
    .select("platform_fee_bps")
    .eq("id", orgId)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (service.from("organizations") as any)
    .update({ platform_fee_bps: platformFeeBps })
    .eq("id", orgId)
    .select("id, platform_fee_bps")
    .single();
  if (error || !data) {
    log.error("failed to update platform fee", { error, orgId });
    return NextResponse.json({ error: "Couldn't update the fee" }, { status: 500 });
  }
  if (before.platform_fee_bps !== platformFeeBps) {
    // organizations has no audit trigger, so record the change explicitly. The
    // entry sits under the affected org (record_type 'organization') and is
    // visible to that org's admins in the audit report.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: staffProfile } = await (service.from("profiles") as any)
      .select("name")
      .eq("id", auth.user.id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: auditError } = await (service.from("audit_log") as any).insert({
      org_id: orgId,
      created_by: auth.user.id,
      record_type: "organization",
      record_id: orgId,
      action: "updated",
      changed_by_name: staffProfile?.name ?? null,
      description: `Platform fee changed from ${formatBps(before.platform_fee_bps)} to ${formatBps(platformFeeBps)}`,
      field_changed: "platform_fee_bps",
      old_value: String(before.platform_fee_bps),
      new_value: String(platformFeeBps),
    });
    if (auditError) log.error("failed to write platform fee audit entry", { error: auditError, orgId });
  }
  log.info("platform fee changed", { orgId, platformFeeBps, staffUserId: auth.user.id });
  return NextResponse.json({ ok: true, platformFeeBps: data.platform_fee_bps });
}
