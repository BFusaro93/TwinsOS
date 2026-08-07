import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitFormResponse } from "@/lib/forms/submit-form-response";

// POST /api/public/forms/[slug]/submit — anonymous form submission
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Load the form with account management settings
  const { data: form, error: formError } = await db
    .from("crm_forms")
    .select(`
      id, org_id, name, settings,
      auto_manage_accounts, account_matching_strategy, account_update_strategy
    `)
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .single();

  if (formError || !form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const body = await req.json();
  const { data: formData = {}, referer, ruleTags } = body;

  const result = await submitFormResponse(db, form, formData, referer, ruleTags);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ ok: true, result: result.result });
}
