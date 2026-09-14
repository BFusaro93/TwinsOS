import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { computeMaterialsNeeded } from "@/lib/reports/materials/materials-needed";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same gate as src/app/api/crm/reports/run/[reportKey]/route.ts — this is
  // a Report Center report that happens to live on its own page (href), so
  // the catalog's client-side permission check never covered this endpoint.
  const { data: canView } = await supabase.rpc("has_settings_permission", {
    p_key: "view_report_center",
  });
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await computeMaterialsNeeded(supabase);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to compute materials needed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
