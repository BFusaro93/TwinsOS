import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { notifyMentions } from "@/lib/comment-mention-notify";

/**
 * POST /api/comments/mention-notify
 *
 * Fired best-effort from useAddComment after the comment insert already
 * succeeded — same pattern as /api/crm/tickets/[id]/notify. Body:
 * { recordType, recordId, mentionedUserIds, commentBody }
 */
const RECORD_TYPES = new Set([
  "requisition", "po", "receiving", "project", "work_order",
  "job_photo", "damage_case", "ticket", "crm_estimate", "injury_case",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("org_id, name")
    .eq("id", user.id)
    .single();
  if (!callerProfile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  let body: {
    recordType?: string;
    recordId?: string;
    mentionedUserIds?: string[];
    commentBody?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.recordType || !body.recordId || !Array.isArray(body.mentionedUserIds) || body.mentionedUserIds.length === 0) {
    return NextResponse.json({ error: "recordType, recordId, and mentionedUserIds are required" }, { status: 400 });
  }

  if (
    typeof body.recordType !== "string" || !RECORD_TYPES.has(body.recordType) ||
    typeof body.recordId !== "string" || !UUID_RE.test(body.recordId) ||
    !body.mentionedUserIds.every((id) => typeof id === "string" && UUID_RE.test(id))
  ) {
    return NextResponse.json({ error: "Invalid recordType, recordId, or mentionedUserIds" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // The caller must have actually commented on this record (in their own org)
  // — proves the record exists/belongs to them and that a mention just happened,
  // so this can't be used to push arbitrary links/text at colleagues.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ownComment } = await (adminClient as any)
    .from("comments")
    .select("id, body")
    .eq("org_id", callerProfile.org_id)
    .eq("record_type", body.recordType)
    .eq("record_id", body.recordId)
    .eq("author_id", user.id)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ownComment) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  // adminClient is service-role and bypasses RLS — without scoping mentioned
  // ids to the caller's own org here, a crafted request could get a comment
  // snippet emailed/pushed to a user in a different org.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: validRecipients } = await (adminClient as any)
    .from("profiles")
    .select("id")
    .eq("org_id", callerProfile.org_id)
    .in("id", body.mentionedUserIds.slice(0, 50));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validIds = (validRecipients ?? []).map((p: any) => p.id as string);
  if (!validIds.length) return NextResponse.json({ success: true });

  await notifyMentions(adminClient, {
    orgId: callerProfile.org_id as string,
    recordType: body.recordType,
    recordId: body.recordId,
    mentionedUserIds: validIds,
    commenterId: user.id,
    commenterName: (callerProfile.name as string | null) ?? "Someone",
    commentBody: String(ownComment.body ?? ""),
  });

  return NextResponse.json({ success: true });
}
