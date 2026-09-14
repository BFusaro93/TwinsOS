import { NextResponse } from "next/server";
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
 */
export function jsonServerError(context: string, err: unknown) {
  apiLogger.error(context, { error: err });
  return jsonError("Internal server error", 500);
}

/** Parses ?limit=&offset= query params, clamped to sane bounds, for public API list endpoints. */
export function parsePagination(url: string): { limit: number; offset: number } {
  const { searchParams } = new URL(url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
  return { limit, offset };
}
