/**
 * Sends a push notification to a crew member via Expo's push API.
 *
 * Registration/storage plumbing (see the migration + route below) is done;
 * this is the send side. Looks up the user's row in `crew_push_tokens` using
 * the service-role client (crew_push_tokens RLS only allows a user to read
 * their own row — this needs to read ANY user's row from server-side trigger
 * code, e.g. an admin approving someone else's requisition), then POSTs to
 * Expo's push API (https://exp.host/--/api/v2/push/send).
 *
 * Not every user has a crew_push_tokens row (only crew-app users who have
 * granted notification permission do) — that's a normal, silent no-op, not
 * an error. Likewise, any failure to reach Expo or a rejected token is
 * logged and swallowed: a failed push must never break the business
 * operation (assigning a visit, approving a requisition, etc.) that
 * triggered it.
 *
 * Trigger points wired to this (see each call site for details):
 *   - New assignment: crm_job_visits.crew_id set (src/app/api/crm/visits/
 *     [visitId]/route.ts, and the notify-crew route it shares logic with).
 *   - Dispatcher note: crm_job_visits.notes_to_crew set (same routes).
 *   - Requisition approved/rejected: src/app/api/notifications/email/route.ts
 *     (alongside the existing email trigger), only for requesters who came
 *     through crew-app's field materials-request flow (i.e. have a
 *     crew_push_tokens row).
 */

import { adminClient } from "@/lib/api/auth";

export interface SendPushInput {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

export async function sendPushToUser({ userId, title, body, data }: SendPushInput): Promise<void> {
  try {
    const db = adminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tokenRow, error } = await (db as any)
      .from("crew_push_tokens")
      .select("expo_push_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[sendPushToUser] crew_push_tokens lookup failed", { userId, error: error.message });
      return;
    }

    const expoPushToken = tokenRow?.expo_push_token as string | undefined;
    if (!expoPushToken) {
      // Not a crew-app user (or hasn't granted notification permission) — no-op.
      return;
    }

    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify({
        to: expoPushToken,
        title,
        body,
        data: data ?? {},
      }),
    });

    if (!res.ok) {
      console.error("[sendPushToUser] Expo push API returned non-2xx", { userId, status: res.status });
      return;
    }

    const json = (await res.json().catch(() => null)) as { data?: ExpoPushTicket } | null;
    const ticket = json?.data;
    if (ticket?.status === "error") {
      console.error("[sendPushToUser] Expo push ticket error", {
        userId,
        message: ticket.message,
        details: ticket.details,
      });
    }
  } catch (err) {
    // Never let a push failure bubble up into the caller's business logic.
    console.error("[sendPushToUser] unexpected failure", {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
