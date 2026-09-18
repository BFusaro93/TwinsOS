import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { computeDailyLoadList } from "@/lib/reports/materials/daily-load-list";

/** "Today" is the company's operating day. The report page derives its initial
 *  date the same way (REPORT_TIME_ZONE there) so a manager in another timezone
 *  and this route never disagree about which day "no ?date=" means. */
function todayNy(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same gate as materials-needed — a Report Center report living on its own
  // page (href), so the catalog's client-side permission check never covers
  // this endpoint.
  const { data: canView } = await supabase.rpc("has_settings_permission", {
    p_key: "view_report_center",
  });
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const date = request.nextUrl.searchParams.get("date") || todayNy();

  try {
    const result = await computeDailyLoadList(supabase, date);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to compute daily load list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
