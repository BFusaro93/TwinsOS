import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { MAX_TRANSLATE_CHARS, translateText } from "@/lib/translate/google";

const Body = z.object({
  text: z.string().trim().min(1).max(MAX_TRANSLATE_CHARS),
  target: z.enum(["en", "es"]),
});

/**
 * POST /api/crm/crew/translate — translate one note for the signed-in crew
 * member (web session or the native app's bearer token). Returns
 * `{ translated, sourceLang, sameLanguage }`; `sameLanguage` is true when the
 * note is already in the requested language, so the UI can say so instead of
 * showing an identical copy.
 */
export async function POST(request: Request) {
  const { user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Per-user cap: each call is a billable request to Google.
  if (!(await checkAuthRateLimit(`crew-translate:${user.id}`, 60, 600))) {
    return NextResponse.json({ error: "Too many translations. Try again in a few minutes." }, { status: 429 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nothing to translate" }, { status: 400 });

  const result = await translateText(parsed.data.text, parsed.data.target);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === "not_configured" ? "Translation isn't set up yet." : "Couldn't translate this right now.", code: result.reason },
      { status: result.reason === "not_configured" ? 503 : 502 }
    );
  }
  return NextResponse.json({
    translated: result.translated,
    sourceLang: result.sourceLang,
    sameLanguage: result.sourceLang.toLowerCase().startsWith(parsed.data.target),
  });
}
