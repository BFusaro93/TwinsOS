import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { submitFormResponse } from "@/lib/forms/submit-form-response";
import { verifyTurnstileToken } from "@/lib/turnstile";

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

  let body: { data?: unknown; turnstileToken?: string; referer?: string } | null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const rawData = body.data ?? {};
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
    return NextResponse.json({ error: "data must be an object" }, { status: 400 });
  }
  const formData = rawData as Record<string, unknown>;

  const forwardedFor = req.headers.get("x-forwarded-for");
  const turnstileResult = await verifyTurnstileToken(body.turnstileToken, forwardedFor?.split(",")[0]?.trim());
  if (!turnstileResult.ok) {
    return NextResponse.json({ error: turnstileResult.error }, { status: 400 });
  }

  // submitFormResponse matches/creates clients, tickets, tags, and fires
  // automations — all RLS-gated on the caller's own profiles.org_id, which is
  // NULL for an anonymous visitor. Every query inside it is explicitly scoped
  // to `form.org_id` (resolved above from the published form, not from the
  // request), so a service-role client here is safe and is what actually
  // lets an anonymous submission do anything beyond inserting its own row.
  // Rule-driven tags (add_tag/remove_tag) are evaluated server-side inside
  // submitFormResponse from the form's own crm_form_rules and these answers.
  // Any client-sent `ruleTags` is ignored — it would let an anonymous caller
  // add/remove arbitrary client tags.
  const result = await submitFormResponse(createServiceClient(), form, formData, typeof body.referer === "string" ? body.referer : undefined);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  return NextResponse.json({ ok: true, result: result.result });
}
