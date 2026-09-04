import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dashboardInputSchema } from "@/types/crm-reports";
import { ensureSystemDashboardsSeeded } from "@/lib/reports/seed-dashboards";
import { isCrewCaller } from "@/lib/reports/crew-dashboard-access";

interface DashboardRow {
  id: string;
  name: string;
  description: string | null;
  config: unknown;
  is_system_seeded: boolean | null;
  visible_to_crew: boolean | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DashboardRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    config: row.config,
    isSystemSeeded: row.is_system_seeded ?? false,
    visibleToCrew: row.visible_to_crew ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Crew logins have no Report Center permission; they only ever see the
  // dashboards an admin explicitly flagged visible_to_crew (and skip the
  // system-template seeding, which is an admin concern).
  const isCrew = await isCrewCaller(supabase, user.id);

  if (!isCrew) {
    // Mirrors the client-side gate in ReportsHub.tsx, but this is the actual
    // boundary — the UI gate only hides the nav link.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: canView } = await (supabase.rpc as any)("has_settings_permission", {
      p_key: "view_report_center",
    });
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await ensureSystemDashboardsSeeded(supabase);
  }

  // crm_dashboards is newer than the generated Database types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("crm_dashboards")
    .select("id, name, description, config, is_system_seeded, visible_to_crew, created_at, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (isCrew) query = query.eq("visible_to_crew", true);
  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    dashboards: ((data ?? []) as DashboardRow[]).map(mapRow),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Mirrors the client-side gate in DashboardBuilder.tsx, but this is the
  // actual boundary — the UI gate only hides the builder controls.
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

  const parsed = dashboardInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid dashboard" },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_dashboards")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      config: parsed.data.config,
      visible_to_crew: parsed.data.visibleToCrew ?? false,
      created_by: user.id,
    })
    .select("id, name, description, config, is_system_seeded, visible_to_crew, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 }
    );
  }
  return NextResponse.json(
    { dashboard: mapRow(data as DashboardRow) },
    { status: 201 }
  );
}
