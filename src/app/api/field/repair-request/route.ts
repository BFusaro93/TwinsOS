import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { submitWorkRequest } from "@/lib/field/submit-work-request";

/**
 * POST /api/field/repair-request — internal field-crew submission.
 *
 * Previously the field page (/photos/field/repair-request) rendered the same
 * PortalForm as the public portal and posted straight to the anonymous
 * /api/public/work-requests route, so a logged-in crew member's submission
 * was indistinguishable from an anonymous one — no requested_by_id/created_by,
 * just a free-text name. This route mirrors that one's insert logic (shared
 * via submitWorkRequest) but resolves the org and attribution from the
 * authenticated session instead of an org slug in the body.
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requestedBy = (body.requestedBy as string | undefined)?.trim();
  const title = (body.title as string | undefined)?.trim();
  if (!requestedBy) return NextResponse.json({ error: "requestedBy is required" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  try {
    const result = await submitWorkRequest(
      supabase,
      { id: profile.org_id },
      {
        requestedBy,
        title,
        description: body.description as string | undefined,
        priority: body.priority as string | undefined,
        equipment: body.equipment as string | undefined,
        assetId: body.assetId as string | undefined,
        equipmentType: body.equipmentType as string | undefined,
        repairCategory: body.repairCategory as string | undefined,
        hasRepairTag: body.hasRepairTag,
      },
      { createdBy: user.id, requestedById: user.id }
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[field/repair-request] error:", err);
    return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
  }
}
