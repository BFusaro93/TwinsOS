import { NextResponse } from "next/server";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Parses ?limit=&offset= query params, clamped to sane bounds, for public API list endpoints. */
export function parsePagination(url: string): { limit: number; offset: number } {
  const { searchParams } = new URL(url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
  return { limit, offset };
}
