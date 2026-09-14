import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitFormResponse } from "@/lib/forms/submit-form-response";

// POST /api/crm/forms/[id]/test-submit — internal "Fill Out Form" test dialog.
// Deliberately separate from the public submit route: that route requires
// status='published' (correct for a real anonymous internet visitor), which
// meant staff could never test a form before publishing it — clicking
// "Fill Out Form" on a brand-new draft always 404'd. This route is gated by
// org membership instead of publish status, so a draft form can be tested.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 403 });

  const { data: form, error: formError } = await db
    .from("crm_forms")
    .select(`
      id, org_id, name, settings,
      auto_manage_accounts, account_matching_strategy, account_update_strategy
    `)
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();

  if (formError || !form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const body = await req.json();
  const { data: formData = {} } = body;

  const result = await submitFormResponse(db, form, formData, "Internal Test");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  return NextResponse.json({ ok: true, result: result.result });
}
