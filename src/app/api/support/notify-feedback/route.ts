import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/api/auth";
import { notifyStaffOfFeedback } from "@/lib/staff-notify";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/support/notify-feedback  { id }
 *
 * Fired best-effort from useSubmitFeedback after the insert already succeeded.
 * The caller must have submitted that feedback themselves within the last
 * 10 minutes, so this can't be used to spam staff or re-send old items.
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
  const { data: fb } = await (db as any)
    .from("feedback")
    .select("category, message, page_url, screenshot_path, created_by, created_at, org_id, organizations(name)")
    .eq("id", id)
    .maybeSingle();
  if (!fb || fb.created_by !== user.id || Date.now() - new Date(fb.created_at).getTime() > 10 * 60 * 1000) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: profile } = await supabase.from("profiles").select("name, email").eq("id", user.id).single();
  const sent = await notifyStaffOfFeedback(db, {
    category: fb.category,
    message: fb.message,
    pageUrl: fb.page_url,
    hasScreenshot: !!fb.screenshot_path,
    orgName: fb.organizations?.name ?? "an organization",
    submitter: profile?.name ?? profile?.email ?? "Unknown user",
  });
  return NextResponse.json({ success: true, sent });
}
