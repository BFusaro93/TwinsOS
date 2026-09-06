import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { findLiveShareToken, proposalUrlFor } from "@/lib/estimates/share-token";
import { logger } from "@/lib/logger";

const log = logger.child("estimate-share-link");

// Same gate as send-email: an authenticated org member whose RLS lets them
// read the estimate. The UI additionally hides the actions behind the
// `estimate_send` permission, exactly like the Send button.
async function getContext() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * GET — the estimate's current live public proposal link, if one exists.
 * Never mints a token: `{ url: null }` means nothing has been sent (or every
 * link has expired / been accepted).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: estimateId } = await params;
  const { supabase, user } = await getContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS scopes this to the caller's org — a foreign estimate reads as 404.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: est } = await (supabase as any)
    .from("estimates").select("id").eq("id", estimateId).maybeSingle();
  if (!est) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

  const live = await findLiveShareToken(supabase, estimateId);
  return NextResponse.json(
    live ? { url: proposalUrlFor(live.token), token: live.token, expiresAt: live.expiresAt } : { url: null },
  );
}

const PostSchema = z.object({
  expiresInDays: z.number().int().positive().max(365).optional(),
});

/**
 * POST — return the live link, minting a token only when none is live. This
 * is the same reuse rule send-email applies, so copying the link and then
 * emailing it hands the client one URL, not two.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: estimateId } = await params;
  const { supabase, user } = await getContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const expiresInDays = parsed.data.expiresInDays ?? 30;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: est } = await (supabase as any)
    .from("estimates").select("id, org_id").eq("id", estimateId).maybeSingle();
  if (!est) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

  const live = await findLiveShareToken(supabase, estimateId);
  if (live) {
    return NextResponse.json({ url: proposalUrlFor(live.token), token: live.token, expiresAt: live.expiresAt, created: false });
  }

  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (supabase as any)
    .from("estimate_share_tokens")
    .insert({ org_id: est.org_id, estimate_id: estimateId, expires_at: expiresAt, created_by: user.id })
    .select("id, token, expires_at")
    .single();
  if (error || !inserted) {
    log.error("Failed to create share token", { estimateId, error: error?.message });
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }

  return NextResponse.json({
    url: proposalUrlFor(inserted.token as string),
    token: inserted.token as string,
    expiresAt: (inserted.expires_at as string | null) ?? null,
    created: true,
  });
}
