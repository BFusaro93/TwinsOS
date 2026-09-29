import { lookup } from "dns/promises";
import { lookup as lookupCb, type LookupAddress } from "dns";
import { request as httpsRequest } from "https";
import { isIPv4, isIPv6, type LookupFunction } from "net";

/**
 * Blocks the common SSRF targets for a user-supplied webhook/callback URL:
 * loopback, RFC1918 private ranges, link-local (including the
 * 169.254.169.254 cloud-metadata address), CGNAT, and their IPv6
 * equivalents. Re-resolves the hostname via DNS rather than trusting the
 * literal string, so "https://evil.example.com" that resolves to
 * 127.0.0.1/10.x/192.168.x is caught too, not just raw IP literals.
 *
 * On its own this is not a defense against DNS-rebinding (the record
 * changing between this check and delivery) or redirects — deliver with
 * postJsonToPublicUrl() below, which re-validates the address actually
 * connected to and never follows redirects.
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "targetUrl must be a valid URL" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "targetUrl must use https://" };
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "metadata.google.internal") {
    return { ok: false, error: "targetUrl may not point at a local or internal host" };
  }

  let addresses: string[];
  try {
    const results = await lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    return { ok: false, error: "targetUrl's host could not be resolved" };
  }

  if (addresses.length === 0 || addresses.some(isPrivateOrReservedIp)) {
    return { ok: false, error: "targetUrl resolves to a private or reserved address" };
  }

  return { ok: true };
}

function isPrivateOrReservedIp(address: string): boolean {
  if (isIPv4(address)) return isPrivateOrReservedIpv4(address);
  if (isIPv6(address)) return isPrivateOrReservedIpv6(address);
  return true; // unrecognized format — fail closed
}

function isPrivateOrReservedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // multicast (224.0.0.0/4) and reserved (240.0.0.0/4), incl. 255.255.255.255

  return false;
}

function isPrivateOrReservedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded IPv4 address instead.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrReservedIpv4(mapped[1]);

  if (normalized === "::1" || normalized === "::") return true; // loopback / unspecified
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // fe80::/10 link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 unique local
  if (normalized.startsWith("ff")) return true; // ff00::/8 multicast

  return false;
}

/**
 * lookup() for https.request that resolves the host and refuses to connect
 * when ANY resolved address is private/reserved. Because the socket connects
 * to exactly the address validated here, a DNS record flipped after
 * assertPublicHttpsUrl() (rebinding) can't reach an internal host.
 */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  lookupCb(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as unknown as LookupAddress[];
    if (!list.length || list.some((a) => isPrivateOrReservedIp(a.address))) {
      return callback(
        Object.assign(new Error("target resolves to a private or reserved address"), { code: "ESSRF" }),
        "",
        0
      );
    }
    if ((options as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    }
    callback(null, list[0].address, list[0].family);
  });
};

/**
 * POSTs JSON to a user-supplied https URL with SSRF protection end to end:
 * the URL is validated, the connection is pinned to a re-validated public
 * address, and redirects are NOT followed (a 3xx is returned as-is, so
 * callers treat it as a failed delivery) — a redirect to an internal
 * address can't bypass the guard.
 */
export async function postJsonToPublicUrl(
  rawUrl: string,
  payload: unknown,
  opts: { timeoutMs?: number } = {}
): Promise<{ ok: boolean; status: number; error?: string }> {
  const safety = await assertPublicHttpsUrl(rawUrl);
  if (!safety.ok) return { ok: false, status: 0, error: safety.error };

  const body = JSON.stringify(payload);
  const url = new URL(rawUrl);
  return new Promise((resolve) => {
    const req = httpsRequest(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        lookup: publicOnlyLookup,
        timeout: opts.timeoutMs ?? 10_000,
      },
      (res) => {
        res.resume(); // drain; the body is never used
        const status = res.statusCode ?? 0;
        resolve({ ok: status >= 200 && status < 300, status });
      }
    );
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", (err) => resolve({ ok: false, status: 0, error: err.message }));
    req.end(body);
  });
}
