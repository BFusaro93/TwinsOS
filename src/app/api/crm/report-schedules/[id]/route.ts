import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAccessReportData } from "@/lib/reports/report-access";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { getMyTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { firstIssueMessage } from "@/lib/utils/zod-message";
import {
  recurrenceFromRow,
  recurrenceProblem,
  recurrenceToColumns,
  type ScheduleRecurrence,
} from "@/lib/reports/schedule-recurrence";
import { withNextRun } from "@/lib/reports/schedule-rows";
import { REPORT_SCHEDULE_COLUMNS, updateReportScheduleSchema } from "@/types/report-schedules";

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
  if (!(await hasAnySettingsPermission(supabase, ["manage_report_center"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateReportScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssueMessage(parsed.error, "Invalid update") },
      { status: 400 }
    );
  }
  const patch = parsed.data;

  const { data: existing } = await supabase
    .from("report_schedules")
    .select(REPORT_SCHEDULE_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });

  const timeZone = await getMyTimeZone(supabase);

  // Changing recipients or turning a schedule back on re-sends its data, so the
  // editor must be able to view the report themselves (the cron sends with
  // the service role). Pausing, or changing timing/format/wording, stays open.
  if (patch.recipients !== undefined || patch.enabled === true) {
    if (!(await canAccessReportData(supabase, existing.report_key, timeZone))) {
      return NextResponse.json({ error: "Your role can't view this report" }, { status: 403 });
    }
  }

  // Validate the recurrence the row will END UP with, so a partial PATCH
  // (e.g. frequency → weekly without weekdays) can't store an incomplete rule.
  const current = recurrenceFromRow(existing);
  const touchesRecurrence =
    patch.frequency !== undefined ||
    patch.hourLocal !== undefined ||
    patch.weekdays !== undefined ||
    patch.monthlyMode !== undefined ||
    patch.monthDay !== undefined ||
    patch.monthWeek !== undefined ||
    patch.monthWeekday !== undefined ||
    patch.startDate !== undefined ||
    patch.endDate !== undefined;
  let recurrenceColumns: ReturnType<typeof recurrenceToColumns> | Record<string, never> = {};
  if (touchesRecurrence) {
    const merged: ScheduleRecurrence = {
      frequency: patch.frequency ?? current.frequency,
      hourLocal: patch.hourLocal ?? current.hourLocal,
      weekdays: patch.weekdays ?? current.weekdays,
      monthlyMode: patch.monthlyMode !== undefined ? patch.monthlyMode : current.monthlyMode,
      monthDay: patch.monthDay !== undefined ? patch.monthDay : current.monthDay,
      monthWeek: patch.monthWeek !== undefined ? patch.monthWeek : current.monthWeek,
      monthWeekday: patch.monthWeekday !== undefined ? patch.monthWeekday : current.monthWeekday,
      startDate: patch.startDate !== undefined ? patch.startDate : current.startDate,
      endDate: patch.endDate !== undefined ? patch.endDate : current.endDate,
    };
    const problem = recurrenceProblem(merged);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    recurrenceColumns = recurrenceToColumns(merged);
  }

  // A one-off whose date has passed would send the moment it's saved or
  // resumed (the cron catches up missed one-offs) — make the user pick a date.
  const finalFrequency = patch.frequency ?? current.frequency;
  const finalStart = patch.startDate !== undefined ? patch.startDate : current.startDate;
  const finalEnabled = patch.enabled ?? existing.enabled;
  if (
    finalFrequency === "once" &&
    finalEnabled &&
    (touchesRecurrence || patch.enabled === true) &&
    finalStart !== null &&
    finalStart < todayInZone(timeZone)
  ) {
    return NextResponse.json({ error: "The send date is in the past — pick a new date." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("report_schedules")
    .update({
      ...recurrenceColumns,
      ...(patch.recipients !== undefined ? { recipients: patch.recipients } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.format !== undefined ? { format: patch.format } : {}),
      ...(patch.emailSubject !== undefined ? { email_subject: patch.emailSubject } : {}),
      ...(patch.emailMessage !== undefined ? { email_message: patch.emailMessage } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(REPORT_SCHEDULE_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ schedule: withNextRun(data, new Date(), timeZone) });
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
  if (!(await hasAnySettingsPermission(supabase, ["manage_report_center"]))) {
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
