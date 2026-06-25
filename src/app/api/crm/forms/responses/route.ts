import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/crm/forms/responses?formId=<uuid>
export async function GET(req: Request) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const formId = searchParams.get("formId");

  let query = db
    .from("crm_form_responses")
    .select(`
      id, form_id, submitted_by_name, submitted_by_email, data, result, status,
      related_client_id, related_ticket_id, form_location, is_read, created_at,
      crm_forms!inner(name)
    `)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (formId) query = query.eq("form_id", formId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (data ?? []).map((r: any) => ({
    id: r.id,
    formId: r.form_id,
    formName: r.crm_forms?.name ?? "—",
    submittedByName: r.submitted_by_name,
    submittedByEmail: r.submitted_by_email,
    data: r.data ?? {},
    result: r.result,
    status: r.status,
    relatedClientId: r.related_client_id,
    relatedTicketId: r.related_ticket_id,
    formLocation: r.form_location,
    isRead: r.is_read,
    createdAt: r.created_at,
  }));

  return NextResponse.json(mapped);
}
