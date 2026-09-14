import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getReport } from "@/lib/reports/registry";

const createScheduleSchema = z.object({
  reportKey: z.string().min(1),
  recipients: z.array(z.string().email()).min(1),
  /** Hour of day (America/New_York, 0-23) the cron should send this at. */
  hourLocal: z.number().int().min(0).max(23).optional(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("report_schedules")
    .select("id, report_key, recipients, enabled, hour_local, last_run_at, last_run_status, last_run_error, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedules: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid schedule" },
      { status: 400 }
    );
  }

  const def = getReport(parsed.data.reportKey);
  if (!def || !def.schedulable) {
    return NextResponse.json({ error: "This report can't be scheduled" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("report_schedules")
    .insert({
      report_key: parsed.data.reportKey,
      recipients: parsed.data.recipients,
      ...(parsed.data.hourLocal !== undefined ? { hour_local: parsed.data.hourLocal } : {}),
      created_by: user.id,
    })
    .select("id, report_key, recipients, enabled, hour_local, last_run_at, last_run_status, last_run_error, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }
  return NextResponse.json({ schedule: data }, { status: 201 });
}
