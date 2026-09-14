import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAuthRateLimit, getClientIp } from "@/lib/auth/rate-limit";

/**
 * POST /api/auth/login
 *
 * Signing in used to call supabase.auth.signInWithPassword() directly from
 * the browser client, which meant there was no server-side chokepoint to
 * apply our own rate limiting — only Supabase's own baseline GoTrue limits
 * applied. Routing sign-in through here adds a limit keyed on the specific
 * account being attacked (not just the caller's IP), on top of Supabase's.
 */
const EMAIL_LIMIT = 8;
const IP_LIMIT = 30;
const WINDOW_SECONDS = 15 * 60;

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const [emailOk, ipOk] = await Promise.all([
    checkAuthRateLimit(`login:email:${email.trim().toLowerCase()}`, EMAIL_LIMIT, WINDOW_SECONDS),
    checkAuthRateLimit(`login:ip:${ip}`, IP_LIMIT, WINDOW_SECONDS),
  ]);

  if (!emailOk || !ipOk) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
