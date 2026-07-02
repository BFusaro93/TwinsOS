import { NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const [invoicesRes, visitsRes, estimatesRes] = await Promise.all([
    supabase
      .from("crm_invoices")
      .select("id, invoice_number, total_cents, balance_cents, due_date, status, created_at")
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .in("status", ["sent", "partial", "overdue"])
      .is("deleted_at", null)
      .order("due_date", { ascending: true })
      .limit(10),

    supabase
      .from("crm_job_visits")
      .select(`id, scheduled_date, status, completed_at, crm_jobs!inner(id, title, job_type, client_id)`)
      .eq("crm_jobs.client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .order("scheduled_date", { ascending: false })
      .limit(20),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("estimates")
      .select("id, estimate_number, title:description, total_price_cents:total_cents, status:stage, expires_at:valid_until_date, created_at")
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .eq("stage", "sent")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5) as Promise<{ data: unknown[] | null }>,
  ]);

  const visits = visitsRes.data ?? [];
  const upcoming = visits
    .filter((v) => v.scheduled_date >= today && v.status !== "completed" && v.status !== "cancelled")
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    .slice(0, 5);
  const recent = visits
    .filter((v) => v.status === "completed")
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))
    .slice(0, 5);

  return NextResponse.json({
    invoices: invoicesRes.data ?? [],
    upcoming,
    recent,
    estimates: estimatesRes.data ?? [],
  });
}
