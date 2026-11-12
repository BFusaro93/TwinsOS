import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { assertOrgWritable } from "@/lib/org-writable";
import { logger } from "@/lib/logger";
import { firstIssueMessage } from "@/lib/utils/zod-message";

const log = logger.child("clients-apply-org-tax-rate");

/** A tax rate in basis points (7.25% = 725), the unit clients.default_tax_rate_bps uses. */
const Bps = z.coerce.number().int().min(0).max(3000);

/**
 * Each client carries its own tax rate (clients.default_tax_rate_bps), stamped
 * from the company rate when the client is created. Changing the company rate
 * afterwards leaves existing clients where they were — so clients added before
 * the rate was first set stay at 0% and their automatic invoices go out
 * untaxed. After the company rate is saved, Settings offers to move the
 * clients still at the OLD rate onto the new one.
 *
 * GET  ?fromBps=N → { count, toBps }  how many clients sit at the old rate.
 * POST { fromBps } → { updated, toBps } moves them to the company's CURRENT rate.
 *
 * The new rate is always read from the org row (never the request), tax-exempt
 * clients are never touched, and the write runs as the caller so RLS, the
 * crm_roles guards and the clients audit trigger (who changed what) all apply.
 * Needs the Accounting Settings key (the tax setting) and Bulk Edit (many
 * clients at once); admins pass both.
 */
async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile || profile.role === "crew") {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  const orgId: string = (await getEffectiveOrgId(supabase)) ?? profile.org_id;

  const canSettings = await hasAnySettingsPermission(supabase, ["accounting_settings"]);
  const canBulk = await hasAnySettingsPermission(supabase, ["client_bulk_edit"]);
  if (!canSettings || !canBulk) {
    return {
      response: NextResponse.json(
        { error: "Updating every client's tax rate needs the Accounting Settings and Client Bulk Edit permissions" },
        { status: 403 }
      ),
    } as const;
  }

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("tax_rate_percent")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr || !org) return { response: NextResponse.json({ error: "Organization not found" }, { status: 404 }) } as const;
  const toBps = Math.round(Number(org.tax_rate_percent ?? 0) * 100);
  return { supabase, user, orgId, toBps } as const;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clientsAtRate(db: any, orgId: string, fromBps: number) {
  return db
    .eq("org_id", orgId)
    .eq("default_tax_rate_bps", fromBps)
    .is("deleted_at", null)
    .or("is_taxable.is.null,is_taxable.eq.true");
}

export async function GET(request: Request) {
  const ctx = await context();
  if ("response" in ctx) return ctx.response;
  const raw = new URL(request.url).searchParams.get("fromBps");
  const parsed = Bps.safeParse(raw);
  if (raw == null || raw === "" || !parsed.success) return NextResponse.json({ error: "fromBps is required" }, { status: 400 });

  if (parsed.data === ctx.toBps) return NextResponse.json({ count: 0, toBps: ctx.toBps });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await clientsAtRate((ctx.supabase as any).from("clients").select("id", { count: "exact", head: true }), ctx.orgId, parsed.data);
  if (error) {
    log.error("count failed", { orgId: ctx.orgId, error: error.message });
    return NextResponse.json({ error: "Could not count clients" }, { status: 500 });
  }
  return NextResponse.json({ count: count ?? 0, toBps: ctx.toBps });
}

export async function POST(request: Request) {
  const ctx = await context();
  if ("response" in ctx) return ctx.response;
  const parsed = z.object({ fromBps: z.number().int().min(0).max(3000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error, "Invalid request") }, { status: 400 });
  }
  const { fromBps } = parsed.data;
  if (fromBps === ctx.toBps) return NextResponse.json({ updated: 0, toBps: ctx.toBps });

  // A read-only org's update would match 0 rows under RLS and look like success.
  const notWritable = await assertOrgWritable(createServiceClient(), ctx.orgId);
  if (notWritable) return notWritable;

  const { count, error } = await clientsAtRate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx.supabase as any).from("clients").update({ default_tax_rate_bps: ctx.toBps }, { count: "exact" }),
    ctx.orgId,
    fromBps
  );
  if (error) {
    log.error("update failed", { orgId: ctx.orgId, fromBps, toBps: ctx.toBps, error: error.message });
    return NextResponse.json({ error: error.message || "Could not update clients" }, { status: error.code === "42501" ? 403 : 500 });
  }
  log.info("applied company tax rate to clients", { orgId: ctx.orgId, userId: ctx.user.id, fromBps, toBps: ctx.toBps, updated: count ?? 0 });
  return NextResponse.json({ updated: count ?? 0, toBps: ctx.toBps });
}
