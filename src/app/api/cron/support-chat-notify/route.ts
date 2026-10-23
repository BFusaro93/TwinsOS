import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyStaffOfSupportMessage } from "@/lib/staff-notify";
import { logger } from "@/lib/logger";

const log = logger.child("support-chat-notify cron");

/** A customer message waits this long for a staff reply before staff are emailed. */
const REPLY_GRACE_MS = 5 * 60 * 1000;
/** Older than this and the email would be stale (cron was down); just mark it handled. */
const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/cron/support-chat-notify — called every minute by Vercel Cron.
 *
 * Emails Landscapt staff about customer support-chat messages that have gone
 * 5 minutes without a staff reply, once per thread (all of a thread's waiting
 * messages go in one email), then stamps them staff_notified_at. A reply that
 * landed within the 5 minutes means no email at all.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */
const serviceClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type PendingRow = {
  id: string;
  org_id: string;
  thread_user_id: string | null;
  sender_name: string;
  body: string;
  created_at: string;
  organizations: { name: string } | null;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();
  const now = Date.now();
  const dueBefore = new Date(now - REPLY_GRACE_MS).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("support_messages")
    .select("id, org_id, thread_user_id, sender_name, body, created_at, organizations(name)")
    .eq("sender_type", "org")
    .is("staff_notified_at", null)
    .lte("created_at", dueBefore)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    log.error("could not read pending support messages", { error: error.message });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const pending = (data ?? []) as PendingRow[];
  const byThread = new Map<string, PendingRow[]>();
  for (const row of pending) {
    const key = `${row.org_id}:${row.thread_user_id ?? "none"}`;
    byThread.set(key, [...(byThread.get(key) ?? []), row]);
  }

  let emailed = 0;
  for (const rows of byThread.values()) {
    const first = rows[0];
    const ids = rows.map((r) => r.id);

    // Did staff answer this thread after the first waiting message? Then no email.
    let threadQuery = db
      .from("support_messages")
      .select("id", { count: "exact", head: true })
      .eq("org_id", first.org_id)
      .eq("sender_type", "staff")
      .gt("created_at", first.created_at);
    threadQuery = first.thread_user_id
      ? threadQuery.eq("thread_user_id", first.thread_user_id)
      : threadQuery.is("thread_user_id", null);
    const { count: staffReplies } = await threadQuery;

    const stale = now - new Date(first.created_at).getTime() > STALE_MS;
    if (!staffReplies && !stale) {
      // First message in the thread, or a follow-up to an earlier staff reply?
      let earlierQuery = db
        .from("support_messages")
        .select("id", { count: "exact", head: true })
        .eq("org_id", first.org_id)
        .lt("created_at", first.created_at);
      earlierQuery = first.thread_user_id
        ? earlierQuery.eq("thread_user_id", first.thread_user_id)
        : earlierQuery.is("thread_user_id", null);
      const { count: earlier } = await earlierQuery;

      const sent = await notifyStaffOfSupportMessage(supabase, {
        orgName: first.organizations?.name ?? "an organization",
        senderName: first.sender_name,
        body: rows.map((r) => r.body).join("\n\n"),
        newConversation: !earlier,
      });
      if (sent > 0) emailed++;
      // Nobody could be emailed (no key / no staff): leave them pending to retry next minute.
      if (sent === 0) continue;
    }

    const { error: stampError } = await db
      .from("support_messages")
      .update({ staff_notified_at: new Date().toISOString() })
      .in("id", ids);
    if (stampError) log.error("could not stamp notified messages", { error: stampError.message });
  }

  return NextResponse.json({ threads: byThread.size, emailed });
}
