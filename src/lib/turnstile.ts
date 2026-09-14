/**
 * Cloudflare Turnstile server-side verification for public form submissions.
 * Fully opt-in: with TURNSTILE_SECRET_KEY unset, verification is skipped
 * entirely so existing/unconfigured forms keep working exactly as before.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true };

  if (!token) {
    return { ok: false, error: "Verification required — please try again." };
  }

  const params = new URLSearchParams();
  params.append("secret", secret);
  params.append("response", token);
  if (remoteIp) params.append("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const data = await res.json();
    if (!data.success) {
      return { ok: false, error: "Verification failed — please try again." };
    }
    return { ok: true };
  } catch {
    // Cloudflare unreachable — verification was explicitly configured but
    // couldn't run, so fail closed rather than silently letting bots through.
    return { ok: false, error: "Verification service unavailable — please try again." };
  }
}
