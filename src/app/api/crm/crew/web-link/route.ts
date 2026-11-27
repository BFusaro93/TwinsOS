import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { orgHasAddon } from "@/lib/stripe/addon-access";
import { logger } from "@/lib/logger";

const log = logger.child("crew/web-link");

/**
 * POST { target: "dashboards" | "field" } — a one-time link that opens that web page already
 * signed in, for the crew app's Dashboards and Field cards (the app opens it in an in-app
 * browser; those pages are the same ones the browser crew login uses).
 *
 * The link signs in AS THE CALLER, the same person who already holds the bearer token, so it
 * grants nothing they don't have: it is a Supabase email-link token, single use, minted for
 * the caller's own address and never emailed. Where it lands is chosen here from a fixed list
 * (the app only names a target), and /confirm only follows a `next` that matches that list.
 */
const Body = z.object({ target: z.enum(["dashboards", "field"]) });

export async function POST(request: Request) {
  const { user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.email) return NextResponse.json({ error: "This login has no email address." }, { status: 400 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid target" }, { status: 400 });

  // Failing closed: each link is a live sign-in token, so a runaway client must not mint them freely.
  const allowed = await checkAuthRateLimit(`webhandoff:user:${user.id}`, 20, 300, { failClosed: true });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests — wait a minute and try again." }, { status: 429 });
  }

  const db = createServiceClient();

  // Dashboards is one page. Field opens Job Photos when the org has that add-on, and the field
  // forms otherwise — the same choice the web home's Field card makes.
  let path = "/dashboards";
  if (parsed.data.target === "field") {
    const { data: profile } = await db.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const hasJobPhotos = profile?.org_id ? await orgHasAddon(db, profile.org_id as string, "job_photos") : false;
    path = hasJobPhotos ? "/photos/jobs" : "/photos/field/damage-report";
  }

  const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({ type: "magiclink", email: user.email });
  const hashedToken = linkData?.properties?.hashed_token;
  if (linkErr || !hashedToken) {
    log.error("generateLink failed", { userId: user.id, error: linkErr?.message });
    return NextResponse.json({ error: "Couldn't open that page. Try again." }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
  const url = `${siteUrl}/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink&next=${encodeURIComponent(path)}`;
  return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
}
