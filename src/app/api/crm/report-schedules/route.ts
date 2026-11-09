import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReport } from "@/lib/reports/registry";
import { canAccessReportData } from "@/lib/reports/report-access";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { getMyTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { firstIssueMessage } from "@/lib/utils/zod-message";
import { recurrenceProblem, recurrenceToColumns } from "@/lib/reports/schedule-recurrence";
import { checkCallerCanScheduleAnalysis, dateWindowProblem } from "@/lib/reports/schedule-analysis-guard";
import { withNextRun } from "@/lib/reports/schedule-rows";
import { createReportScheduleSchema, REPORT_SCHEDULE_COLUMNS } from "@/types/report-schedules";

/** GET — every live schedule in the caller's org (RLS scopes to my_org_id()),
 *  for the Report Center's Scheduled tab and the per-report dialog. Same gate
 *  as the Report Center itself; writing needs manage_report_center. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasAnySettingsPermission(supabase, ["view_report_center"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("report_schedules")
    .select(REPORT_SCHEDULE_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const timeZone = await getMyTimeZone(supabase);
  const now = new Date();
  return NextResponse.json({ schedules: (data ?? []).map((row) => withNextRun(row, now, timeZone)) });
}

export async function POST(request: Request) {
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

  const parsed = createScheduleParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const input = parsed.data;

  const timeZone = await getMyTimeZone(supabase);
  let windowDataset: string | null = null;
  if (input.customReportId) {
    // A saved analysis: the cron re-loads the config from the row at send time,
    // so only existence, schedulability and the caller's access matter here.
    const check = await checkCallerCanScheduleAnalysis(supabase, input.customReportId);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
    windowDataset = check.config.dataset;
  } else {
    const def = getReport(input.reportKey ?? "");
    if (!def || !def.schedulable) {
      return NextResponse.json({ error: "This report can't be scheduled" }, { status: 400 });
    }
    // The cron renders the report with the service role, so this is the only
    // place the caller's report/dataset keys are checked.
    if (!(await canAccessReportData(supabase, input.reportKey as string, timeZone))) {
      return NextResponse.json({ error: "Your role can't view this report" }, { status: 403 });
    }
  }
  const windowError = dateWindowProblem(windowDataset, input.dateFilterColumn ?? null, input.dateWindow ?? null);
  if (windowError) return NextResponse.json({ error: windowError }, { status: 400 });

  const recurrence = {
    frequency: input.frequency,
    hourLocal: input.hourLocal,
    weekdays: input.weekdays,
    monthlyMode: input.monthlyMode,
    monthDay: input.monthDay,
    monthWeek: input.monthWeek,
    monthWeekday: input.monthWeekday,
    startDate: input.startDate,
    endDate: input.endDate,
  };
  const problem = recurrenceProblem(recurrence);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  // A one-off in the past would send the moment it's saved; say so instead.
  if (input.frequency === "once" && input.startDate && input.startDate < todayInZone(timeZone)) {
    return NextResponse.json({ error: "The send date is in the past." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("report_schedules")
    .insert({
      report_key: input.reportKey ?? null,
      custom_report_id: input.customReportId ?? null,
      date_filter_column: input.dateFilterColumn ?? null,
      date_window: input.dateWindow ?? null,
      recipients: input.recipients,
      ...recurrenceToColumns(recurrence),
      format: input.format,
      email_subject: input.emailSubject ?? null,
      email_message: input.emailMessage ?? null,
      created_by: user.id,
    })
    .select(REPORT_SCHEDULE_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }
  return NextResponse.json({ schedule: withNextRun(data, new Date(), timeZone) }, { status: 201 });
}

function createScheduleParse(body: unknown) {
  const parsed = createReportScheduleSchema.safeParse(body);
  return parsed.success
    ? ({ success: true, data: parsed.data } as const)
    : ({ success: false, error: firstIssueMessage(parsed.error, "Invalid schedule") } as const);
}
