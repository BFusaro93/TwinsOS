import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";

const AddMaterialSchema = z.object({
  description: z.string().min(1),
  qty: z.number().positive(),
  unitCostCents: z.number().int().min(0),
  visitId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

async function recalcJobMaterialCost(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string,
  orgId: string
) {
  const { data } = await supabase
    .from("crm_job_materials")
    .select("total_cost_cents")
    .eq("job_id", jobId)
    .eq("org_id", orgId)
    .is("deleted_at", null);

  const total = (data ?? []).reduce(
    (sum: number, row: { total_cost_cents: number }) => sum + (row.total_cost_cents ?? 0),
    0
  );

  await supabase
    .from("crm_jobs")
    .update({ actual_material_cost_cents: total })
    .eq("id", jobId)
    .eq("org_id", orgId);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any).from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const { jobId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_materials")
    .select("*")
    .eq("job_id", jobId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any).from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const { jobId } = await params;
  const body = await request.json();
  const parsed = AddMaterialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { description, qty, unitCostCents, visitId, notes } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_materials")
    .insert({
      org_id: profile.org_id,
      job_id: jobId,
      visit_id: visitId ?? null,
      description,
      qty,
      unit_cost_cents: unitCostCents,
      notes: notes ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recalcJobMaterialCost(supabase, jobId, profile.org_id as string);

  return NextResponse.json(data, { status: 201 });
}
