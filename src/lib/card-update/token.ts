import { createHash, randomBytes } from "node:crypto";

/** How long a card-update link works. */
export const CARD_UPDATE_TTL_DAYS = 14;

/** A fresh URL-safe token (256 bits) and the hash that gets stored. The token itself is never persisted. */
export function generateCardUpdateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashCardUpdateToken(token) };
}

export function hashCardUpdateToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function cardUpdateExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + CARD_UPDATE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function cardUpdateUrlFor(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://landscapt.com"}/card-update/${token}`;
}

/** Tokens are 43 base64url chars; reject anything else before touching the database. */
export function looksLikeCardUpdateToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,64}$/.test(token);
}

export type CardUpdateTokenState = "valid" | "expired" | "used";

export function cardUpdateTokenState(
  row: { expires_at: string; used_at: string | null },
  now: Date = new Date(),
): CardUpdateTokenState {
  if (row.used_at) return "used";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  return "valid";
}
