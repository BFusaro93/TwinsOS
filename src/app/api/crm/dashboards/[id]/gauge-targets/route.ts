import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dashboardConfigSchema } from "@/types/crm-reports";
import { firstIssueMessage } from "@/lib/utils/zod-message";
import { logger } from "@/lib/logger";

const log = logger.child("dashboard gauge targets");

const bodySchema = z.object({
  panelId: z.string().min(1).max(200),
  /** In the gauge value's own unit: cents for money gauges, a count otherwise. */
  target: z.number().positive().max(1e13),
});

/**
 * Sets the org's goal for one gauge panel on a dashboard. Deliberately NOT
 * behind the Advanced Reporting add-on: the built-in dashboards' gauges need a
 * goal on every plan. Admins and Manage Report Center holders only (RLS on
 * crm_dashboard_gauge_targets enforces the same), and only for a gauge panel
 * that exists on that dashboard.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canManage } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "manage_report_center",
  });
  if (!canManage) {
    return NextResponse.json({ error: "Only an admin or someone who can manage the Report Center can set goals." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error, "Invalid goal") }, { status: 400 });
  }
  const { panelId, target } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: dashboard } = await db
    .from("crm_dashboards")
    .select("id, org_id, config")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!dashboard) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });

  const config = dashboardConfigSchema.safeParse(dashboard.config);
  const panel = config.success
    ? config.data.tabs.flatMap((t) => t.panels).find((p) => p.id === panelId)
    : undefined;
  if (!panel || panel.visual?.type !== "gauge") {
    return NextResponse.json({ error: "That panel isn't a gauge on this dashboard" }, { status: 400 });
  }

  const { error } = await db
    .from("crm_dashboard_gauge_targets")
    .upsert(
      {
        org_id: dashboard.org_id,
        dashboard_id: id,
        panel_id: panelId,
        target,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
        deleted_at: null,
      },
      { onConflict: "dashboard_id,panel_id" }
    );
  if (error) {
    log.error("failed to save gauge goal", { error, dashboardId: id, panelId });
    return NextResponse.json({ error: "Couldn't save the goal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, panelId, target });
}
