import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";

const PatchMaterialSchema = z.object({
  description: z.string().min(1).optional(),
  qty: z.number().positive().optional(),
  unitCostCents: z.number().int().min(0).optional(),
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string; materialId: string }> }
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

  const { jobId, materialId } = await params;
  const body = await request.json();
  const parsed = PatchMaterialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.qty !== undefined) patch.qty = parsed.data.qty;
  if (parsed.data.unitCostCents !== undefined) patch.unit_cost_cents = parsed.data.unitCostCents;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_materials")
    .update(patch)
    .eq("id", materialId)
    .eq("job_id", jobId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recalcJobMaterialCost(supabase, jobId, profile.org_id as string);

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string; materialId: string }> }
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

  const { jobId, materialId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("crm_job_materials")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", materialId)
    .eq("job_id", jobId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recalcJobMaterialCost(supabase, jobId, profile.org_id as string);

  return NextResponse.json({ success: true });
}
