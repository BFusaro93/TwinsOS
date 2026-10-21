import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/api/auth";
import { notifySupportInboxOfAskAI } from "@/lib/staff-notify";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/support/ask/escalate  { logIds: string[] }
 *
 * Fired best-effort after the user sends an Ask AI conversation to support.
 * Flags the caller's own logged questions as escalated, which puts them at
 * the top of the staff "Ask AI" review tab. Only rows the caller asked, in
 * their own org, can be flagged.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { logIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const ids = (Array.isArray(body.logIds) ? body.logIds : [])
    .filter((id): id is string => typeof id === "string" && UUID_RE.test(id))
    .slice(0, 50);
  if (ids.length === 0) return NextResponse.json({ success: true, flagged: 0 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: "Org not found" }, { status: 403 });

  // Only rows not already escalated, so pressing the button twice (or
  // re-sending the same conversation) emails support once.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (adminClient() as any)
    .from("ask_ai_questions")
    .update({ escalated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("org_id", profile.org_id)
    .eq("created_by", user.id)
    .is("escalated_at", null)
    .select("id, question, answer, created_at");
  if (error) return NextResponse.json({ error: "Failed to flag questions" }, { status: 500 });

  const flagged = (data ?? []) as { id: string; question: string; answer: string | null; created_at: string }[];
  if (flagged.length > 0) {
    const [{ data: org }, { data: asker }] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
      supabase.from("profiles").select("name, email").eq("id", user.id).maybeSingle(),
    ]);
    // One email per send, led by the newest question in the conversation.
    const latest = [...flagged].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    await notifySupportInboxOfAskAI({
      kind: "escalated",
      orgName: org?.name ?? "an organization",
      asker: asker?.name ?? asker?.email ?? "Unknown user",
      question: latest.question,
      answer: latest.answer,
    });
  }
  return NextResponse.json({ success: true, flagged: flagged.length });
}
