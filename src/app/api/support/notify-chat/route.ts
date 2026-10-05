import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/api/auth";
import { notifyStaffOfSupportMessage } from "@/lib/staff-notify";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A burst of messages from the customer becomes one email, not one per line.
const QUIET_GAP_MS = 15 * 60 * 1000;

/**
 * POST /api/support/notify-chat  { id }
 *
 * Fired best-effort after a customer org posts a support message. Emails staff
 * when it starts a new conversation, replies to staff, or follows a quiet gap
 * of 15+ minutes — not for every line of a rapid back-and-forth. Only the
 * sender of an org-side message, within 10 minutes of sending it.
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let id: unknown;
  try {
    ({ id } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof id !== "string" || !UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = adminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: msg } = await (db as any)
    .from("support_messages")
    .select("org_id, sender_type, sender_id, sender_name, body, created_at, organizations(name)")
    .eq("id", id)
    .maybeSingle();
  if (
    !msg ||
    msg.sender_type !== "org" ||
    msg.sender_id !== user.id ||
    Date.now() - new Date(msg.created_at).getTime() > 10 * 60 * 1000
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: previous } = await (db as any)
    .from("support_messages")
    .select("sender_type, created_at")
    .eq("org_id", msg.org_id)
    .lt("created_at", msg.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const newConversation = !previous;
  const worthEmailing =
    newConversation ||
    previous.sender_type === "staff" ||
    new Date(msg.created_at).getTime() - new Date(previous.created_at).getTime() > QUIET_GAP_MS;
  if (!worthEmailing) return NextResponse.json({ success: true, sent: 0 });

  const sent = await notifyStaffOfSupportMessage(db, {
    orgName: msg.organizations?.name ?? "an organization",
    senderName: msg.sender_name,
    body: msg.body,
    newConversation,
  });
  return NextResponse.json({ success: true, sent });
}
