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

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // adminClient is service-role and bypasses RLS — without scoping mentioned
  // ids to the caller's own org here, a crafted request could get a comment
  // snippet emailed/pushed to a user in a different org.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: validRecipients } = await (adminClient as any)
    .from("profiles")
    .select("id")
    .eq("org_id", callerProfile.org_id)
    .in("id", body.mentionedUserIds);
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
    commentBody: body.commentBody ?? "",
  });

  return NextResponse.json({ success: true });
}
