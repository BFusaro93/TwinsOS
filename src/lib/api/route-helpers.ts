import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const apiLogger = logger.child("api/v1");

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * For 500-level "something went wrong on the DB side" responses in the
 * public v1 API. Third-party callers only need to know the request failed —
 * a raw Postgres error (`error.message`) can leak internal schema details
 * (column/constraint/table names), so this logs the real error server-side
 * and returns a fixed generic message instead.
 *
 * Never use this for 400/404 validation or not-found responses — those
 * messages are intentionally caller-facing and don't leak internals.
 *
 * A database GUARD error (see mapDbGuardError) is not a server fault and is
 * returned as its 4xx instead.
 */
export function jsonServerError(context: string, err: unknown) {
  const guard = mapDbGuardError(err);
  if (guard) {
    apiLogger.warn(context, { error: err, status: guard.status });
    return jsonError(guard.message, guard.status);
  }
  apiLogger.error(context, { error: err });
  return jsonError("Internal server error", 500);
}

/**
 * A database rule rejecting the request (a guard trigger, a CHECK, a missing
 * referenced row, a permission check) is the CALLER's problem, not a server
 * fault: it used to come back as a bare 500 "Internal server error", so an
 * integration couldn't tell "you can't do that" from "try again later" and
 * retried forever.
 *
 *   23514 check_violation / P0001 raise_exception → 409
 *   42501 insufficient_privilege                  → 403
 *   23503 foreign_key_violation                   → 400
 *   23505 unique_violation                        → 409
 *
 * Our own triggers raise with a sentence written for the user ("This account
 * has been a client, so it can't be set back to a lead…"), so that message is
 * returned as-is. Postgres's OWN wording for the same codes names tables,
 * constraints and key values ("violates check constraint
 * \"clients_status_check\"") — those get a fixed message instead, same reason
 * jsonServerError hides 500s.
 */
export function mapDbGuardError(err: unknown): { status: 400 | 403 | 409; message: string } | null {
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: unknown }).code;
  const raw = (err as { message?: unknown }).message;
  const message = typeof raw === "string" ? raw.trim() : "";
  if (typeof code !== "string") return null;

  const generated = (pattern: RegExp) => !message || pattern.test(message);
  switch (code) {
    case "P0001":
      return { status: 409, message: message || "The request was rejected by a data rule" };
    case "23514":
      return {
        status: 409,
        message: generated(/violates check constraint/i) ? "A value in the request is not allowed for this record" : message,
      };
    case "23505":
      return {
        status: 409,
        message: generated(/duplicate key value violates unique constraint/i) ? "A record with these details already exists" : message,
      };
    case "23503":
      return {
        status: 400,
        message: generated(/violates foreign key constraint/i) ? "A referenced record does not exist or is still in use" : message,
      };
    case "42501":
      return {
        status: 403,
        message: generated(/^permission denied for /i) ? "You do not have permission to make this change" : message,
      };
    default:
      return null;
  }
}

/**
 * For a client id that no longer resolves: when the client was merged into
 * another one (Merge Clients soft-deletes the duplicate and records
 * clients.merged_into_client_id), returns the surviving client's id so the
 * caller can repoint its own records instead of failing forever. Follows a
 * chain of merges. Service-role client only (resolve_merged_client is not
 * granted to signed-in users).
 */
export async function findMergedIntoClientId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  orgId: string,
  clientId: string
): Promise<string | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) return null;
  const { data, error } = await db.rpc("resolve_merged_client", { p_org_id: orgId, p_client_id: clientId });
  if (error || typeof data !== "string" || data === clientId) return null;
  return data;
}

/** 404 for a client id, carrying mergedIntoClientId when the client was merged into another. */
export async function clientNotFoundResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  orgId: string,
  clientId: string,
  message = "Client not found"
) {
  const mergedIntoClientId = await findMergedIntoClientId(db, orgId, clientId);
  return NextResponse.json(
    mergedIntoClientId
      ? { error: `${message} — it was merged into client ${mergedIntoClientId}`, mergedIntoClientId }
      : { error: message },
    { status: 404 }
  );
}

/** Parses ?limit=&offset= query params, clamped to sane bounds, for public API list endpoints. */
export function parsePagination(url: string): { limit: number; offset: number } {
  const { searchParams } = new URL(url);
  // Whole numbers only: a fractional limit/offset ("limit=2.5") would reach
  // PostgREST's range() as a non-integer, and Infinity would break the offset.
  const whole = (raw: string | null, fallback: number) => {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) ? n : fallback;
  };
  const limit = Math.min(Math.max(whole(searchParams.get("limit"), 50) || 50, 1), 200);
  const offset = Math.min(Math.max(whole(searchParams.get("offset"), 0), 0), 1_000_000);
  return { limit, offset };
}
