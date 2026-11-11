import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

const log = logger.child("api-idempotency");

/** Header a caller sets to make a create safe to retry. Same name Stripe uses. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/** How long a stored response is replayed for the same key. */
const KEY_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * A pending row older than this is treated as abandoned (the request that
 * claimed the key crashed or timed out before recording its result), so a
 * retry can take the key over instead of being told "in progress" for a day.
 * Longer than any create route's own runtime.
 */
const PENDING_STALE_MS = 2 * 60 * 1000;

const KEY_PATTERN = /^[\x21-\x7E]{1,255}$/;

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** JSON with object keys sorted, so `{a,b}` and `{b,a}` hash the same. Non-JSON bodies hash as-is. */
function canonicalBody(text: string): string {
  if (!text.trim()) return "";
  try {
    const sort = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(sort);
      if (v && typeof v === "object") {
        return Object.fromEntries(
          Object.keys(v as Record<string, unknown>)
            .sort()
            .map((k) => [k, sort((v as Record<string, unknown>)[k])])
        );
      }
      return v;
    };
    return JSON.stringify(sort(JSON.parse(text)));
  } catch {
    return text;
  }
}

type KeyRow = {
  id: string;
  method: string;
  path: string;
  request_hash: string;
  response_status: number | null;
  response_body: unknown;
  created_at: string;
  expires_at: string;
};

/**
 * Makes a POST create safe to retry: with an `Idempotency-Key` header, the
 * same key and the same request within 24 hours returns the first response
 * instead of creating a second record. Without the header the handler just
 * runs, exactly as before.
 *
 *  - same key, same method + path + body  → the stored response is replayed
 *    (`Idempotent-Replayed: true`)
 *  - same key, different request          → 422
 *  - same key while the first request is still running → 409 (retry shortly)
 *  - the first request failed (any non-2xx, or it threw) → the key is
 *    released, so the caller can retry with the same key once it fixes the
 *    problem. Only successful creates are remembered.
 *
 * Call after authentication (the key is scoped to the caller's org) and pass
 * the route's own create logic as `handler`. The table is service-role only
 * (RLS on, no policies); `db` must be the service-role client the public API
 * and Zapier routes already use. If the table can't be reached the request
 * runs without idempotency rather than failing.
 */
export async function withIdempotency(
  db: AnyClient,
  orgId: string,
  request: Request,
  handler: () => Promise<Response>
): Promise<Response> {
  const rawKey = request.headers.get(IDEMPOTENCY_HEADER);
  if (rawKey === null) return handler();
  const key = rawKey.trim();
  if (!KEY_PATTERN.test(key)) {
    return errorResponse(`${IDEMPOTENCY_HEADER} must be 1-255 visible ASCII characters (a UUID is ideal)`, 400);
  }

  const method = request.method.toUpperCase();
  const path = new URL(request.url).pathname;
  const bodyText = await request.clone().text().catch(() => "");
  const requestHash = createHash("sha256").update(`${method}\n${path}\n${canonicalBody(bodyText)}`).digest("hex");

  const now = Date.now();
  const fresh = () => ({
    method,
    path,
    request_hash: requestHash,
    response_status: null,
    response_body: null,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + KEY_TTL_MS).toISOString(),
  });

  let rowId: string | null = null;
  const { data: inserted, error: insertError } = await db
    .from("api_idempotency_keys")
    .insert({ org_id: orgId, key, ...fresh() })
    .select("id")
    .maybeSingle();

  if (inserted) {
    rowId = inserted.id as string;
  } else if (insertError?.code === "23505") {
    const { data: existing } = await db
      .from("api_idempotency_keys")
      .select("id, method, path, request_hash, response_status, response_body, created_at, expires_at")
      .eq("org_id", orgId)
      .eq("key", key)
      .maybeSingle();
    const row = existing as KeyRow | null;
    if (!row) {
      // Deleted between our insert and this read (released by a failed first request).
      return errorResponse("A request with this Idempotency-Key is already in progress — retry in a moment", 409);
    }

    const expired = Date.parse(row.expires_at) <= now;
    const abandoned = row.response_status === null && Date.parse(row.created_at) <= now - PENDING_STALE_MS;
    if (expired || abandoned) {
      // Take the key over — conditioned on the row being unchanged, so two
      // retries racing for an abandoned key can't both win.
      const { data: taken } = await db
        .from("api_idempotency_keys")
        .update(fresh())
        .eq("id", row.id)
        .eq("created_at", row.created_at)
        .select("id")
        .maybeSingle();
      if (!taken) {
        return errorResponse("A request with this Idempotency-Key is already in progress — retry in a moment", 409);
      }
      rowId = taken.id as string;
    } else if (row.request_hash !== requestHash || row.method !== method || row.path !== path) {
      return errorResponse(
        `This ${IDEMPOTENCY_HEADER} was already used for a different request in the last 24 hours — use a new key for a new request`,
        422
      );
    } else if (row.response_status === null) {
      return errorResponse("A request with this Idempotency-Key is already in progress — retry in a moment", 409);
    } else {
      return new Response(JSON.stringify(row.response_body ?? null), {
        status: row.response_status,
        headers: { "Content-Type": "application/json", "Idempotent-Replayed": "true" },
      });
    }
  } else {
    // Table missing / unreachable: run the create without the guarantee rather than fail it.
    log.error("idempotency claim failed — running without it", { error: insertError, orgId, path });
    return handler();
  }

  const release = async () => {
    const { error } = await db.from("api_idempotency_keys").delete().eq("id", rowId);
    if (error) log.error("idempotency release failed", { error, orgId, path });
  };

  let response: Response;
  try {
    response = await handler();
  } catch (err) {
    await release();
    throw err;
  }

  if (response.status < 200 || response.status >= 300) {
    await release();
    return response;
  }

  let body: unknown = null;
  try {
    const text = await response.clone().text();
    body = text ? JSON.parse(text) : null;
  } catch {
    // Every create route answers with JSON; anything else just isn't replayable.
    await release();
    return response;
  }
  const { error: saveError } = await db
    .from("api_idempotency_keys")
    .update({ response_status: response.status, response_body: body, updated_at: new Date().toISOString() })
    .eq("id", rowId);
  if (saveError) {
    log.error("idempotency result save failed", { error: saveError, orgId, path });
    await release();
  }
  return response;
}

/** Deletes expired keys. Called from a daily cron; the rows are a short-lived replay cache, not records. */
export async function purgeExpiredIdempotencyKeys(db: AnyClient): Promise<void> {
  const { error } = await db.from("api_idempotency_keys").delete().lt("expires_at", new Date().toISOString());
  if (error) log.error("idempotency purge failed", { error });
}
