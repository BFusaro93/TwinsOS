/**
 * A user-typed web address that is safe to put in an href: http(s) only.
 * "www.acme.com" (no scheme) used to render as a RELATIVE link that opened
 * /po/vendors/www.acme.com (a 404), and nothing stopped javascript:/data: URLs
 * from being stored. Returns the normalized absolute URL, or null when it
 * can't be made safe.
 */
export function normalizeExternalUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  // "host:8080/path" looks like a scheme to the regex but is a host:port.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[^/:]+:\d+(\/|$)/.test(trimmed);
  const withScheme = hasScheme ? trimmed : `https://${trimmed.replace(/^\/\//, "")}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
