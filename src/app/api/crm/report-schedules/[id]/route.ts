import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canAccessReportData } from "@/lib/reports/report-access";
import { getMyTimeZone } from "@/lib/time/org-timezone";
import { firstIssueMessage } from "@/lib/utils/zod-message";

const updateScheduleSchema = z.object({
  recipients: z.array(z.string().email()).min(1).optional(),
  enabled: z.boolean().optional(),
  hourLocal: z.number().int().min(0).max(23).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The UI hides these controls behind manage_report_center, but that is only a
  // hint — this is the boundary (view-only roles could otherwise edit/delete).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canManage } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "manage_report_center",
  });
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssueMessage(parsed.error, "Invalid update") },
      { status: 400 }
    );
  }

  const { recipients, enabled, hourLocal } = parsed.data;
  // Changing recipients or turning a schedule back on re-sends its data, so the
  // editor must be able to view the report themselves (the cron sends with
  // the service role). Pausing (enabled: false) or changing the hour stays open.
  if (recipients !== undefined || enabled === true) {
    const { data: existing } = await supabase
      .from("report_schedules")
      .select("report_key")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    if (!(await canAccessReportData(supabase, existing.report_key as string, await getMyTimeZone(supabase)))) {
      return NextResponse.json({ error: "Your role can't view this report" }, { status: 403 });
    }
  }
  const { data, error } = await supabase
    .from("report_schedules")
    .update({
      ...(recipients !== undefined ? { recipients } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(hourLocal !== undefined ? { hour_local: hourLocal } : {}),
    })
    .eq("id", id)
    .select("id, report_key, recipients, enabled, hour_local, last_run_at, last_run_status, last_run_error, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ schedule: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The UI hides these controls behind manage_report_center, but that is only a
  // hint — this is the boundary (view-only roles could otherwise edit/delete).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canManage } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "manage_report_center",
  });
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("report_schedules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
