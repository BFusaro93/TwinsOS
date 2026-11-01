import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rejectWithoutFormsPermission } from "@/lib/auth/forms-permission";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";

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
  if (profile) profile.org_id = (await getEffectiveOrgId(supabase)) ?? profile.org_id;
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 403 });
  {
    const denied = await rejectWithoutFormsPermission(supabase, "view");
    if (denied) return denied;
  }

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

// Exactly one kind of change per request. Read-flag toggles need only the
// "view" permission (anyone who can see responses can mark them read/unread);
// status changes and delete are "edit" (forms_edit) because they resolve or
// remove submissions for everyone.
const patchSchema = z
  .object({
    id: z.string().uuid(),
    isRead: z.boolean().optional(),
    status: z.enum(["on_hold", "completed", "spam", "ignored"]).optional(),
    delete: z.literal(true).optional(),
  })
  .refine((v) => [v.isRead !== undefined, v.status !== undefined, v.delete === true].filter(Boolean).length === 1, {
    message: "Provide exactly one of isRead, status, or delete",
  });

// PATCH /api/crm/forms/responses — { id, isRead } | { id, status } | { id, delete: true }
// Marks a response read/unread, moves it between On Hold / Completed / Spam /
// Ignored, or soft-deletes it (deleted_at; rows are never hard-deleted).
export async function PATCH(req: Request) {
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
  if (profile) profile.org_id = (await getEffectiveOrgId(supabase)) ?? profile.org_id;
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "id and exactly one of isRead, status, or delete are required" }, { status: 400 });
  }
  const { id, isRead, status, delete: remove } = parsed.data;

  {
    const denied = await rejectWithoutFormsPermission(supabase, isRead !== undefined ? "view" : "edit");
    if (denied) return denied;
  }

  const patch: Record<string, unknown> =
    isRead !== undefined
      ? { is_read: isRead }
      : status !== undefined
        ? { status }
        : { deleted_at: new Date().toISOString() };

  const { data, error } = await db
    .from("crm_form_responses")
    .update(patch)
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "Response not found" }, { status: 404 });

  return NextResponse.json({ ok: true, deleted: remove === true });
}
