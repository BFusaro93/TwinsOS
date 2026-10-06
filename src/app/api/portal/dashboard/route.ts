import { NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";

export async function GET() {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  // The customer's portal shows the SERVICE PROVIDER's day — a customer in
  // another timezone must see the same schedule the crew works to.
  const today = todayInZone(await getOrgTimeZone(supabase, ctx.orgId));

  const [invoicesRes, upcomingRes, recentRes, estimatesRes] = await Promise.all([
    supabase
      .from("crm_invoices")
      .select("id, invoice_number, total_cents, balance_cents, due_date, status, created_at")
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .in("status", ["printed", "sent", "viewed", "partial", "overdue"])
      .is("deleted_at", null)
      .order("due_date", { ascending: true })
      .limit(10),

    // Two separate queries: one mixed list ordered newest-first with a limit
    // would fill with far-future/cancelled rows and starve "upcoming" (or
    // "recent") of the rows it actually needs.
    supabase
      .from("crm_job_visits")
      .select(`id, scheduled_date, status, completed_at, crm_jobs!inner(id, title, job_type, client_id)`)
      .eq("crm_jobs.client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .gte("scheduled_date", today)
      .not("status", "in", "(completed,cancelled)")
      .order("scheduled_date", { ascending: true })
      .limit(5),

    supabase
      .from("crm_job_visits")
      .select(`id, scheduled_date, status, completed_at, crm_jobs!inner(id, title, job_type, client_id)`)
      .eq("crm_jobs.client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .eq("status", "completed")
      .order("scheduled_date", { ascending: false })
      .limit(5),

    // Portal customers have no RLS read path to estimates (it would expose
    // internal cost/margin columns) — service client, scoped to this client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createServiceClient() as any)
      .from("estimates")
      .select("id, estimate_number, title:description, total_price_cents:total_cents, status:stage, expires_at:valid_until_date, created_at")
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .eq("stage", "sent")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5) as Promise<{ data: unknown[] | null }>,
  ]);

  const upcoming = upcomingRes.data ?? [];
  const recent = recentRes.data ?? [];

  return NextResponse.json({
    invoices: invoicesRes.data ?? [],
    upcoming,
    recent,
    estimates: estimatesRes.data ?? [],
  });
}
