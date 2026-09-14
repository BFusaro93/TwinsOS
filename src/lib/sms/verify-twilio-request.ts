import crypto from "crypto";

/**
 * Verifies Twilio's X-Twilio-Signature header per their documented algorithm:
 * HMAC-SHA1(authToken, url + sorted(key+value for every POST param)), base64.
 * No twilio SDK dependency — this is the entire algorithm, not worth adding
 * a package for.
 */
export function verifyTwilioRequest(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>
): boolean {
  if (!signature) return false;

  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Parses a Twilio form-encoded webhook body into a flat string map. */
export function parseTwilioForm(rawBody: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    params[key] = value;
  }
  return params;
}
