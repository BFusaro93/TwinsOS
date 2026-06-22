import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import type { Database } from "@/types/supabase";

const schema = z.object({
  title: z.string().min(1).max(200),
  equipmentName: z.string().min(1),
  equipmentType: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  description: z.string().min(1),
  priority: z.enum(["low", "medium", "high", "critical"]),
  hasRepairTag: z.boolean().default(false),
  requestedByName: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const d = parsed.data;
  const requestNumber = `MR-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("maintenance_requests")
    .insert({
      request_number: requestNumber,
      title: d.title,
      description: d.description,
      priority: d.priority,
      status: "open",
      requested_by_name: d.requestedByName,
      asset_name: d.equipmentName,
      equipment_type: d.equipmentType ?? null,
      repair_category: d.location ?? null,
      has_repair_tag: d.hasRepairTag,
      created_by: user.id,
    })
    .select("id, request_number")
    .single();

  if (error) {
    console.error("[field/repair-request] insert error:", error);
    return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, requestNumber: data.request_number }, { status: 201 });
}
