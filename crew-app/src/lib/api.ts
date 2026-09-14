import { File, UploadType } from 'expo-file-system';

import { supabase } from '@/lib/supabase';
import type { CrewVisitsResponse, PickerProduct, VisitPhoto, VisitRequisition } from '@/lib/types';

// Base URL for the Next.js app's API routes (src/app/api/...) — see
// crew-app/.env for how this is configured per environment. clockInVisit()/
// clockOutVisit()/uploadVisitPhoto() below are called by the offline sync
// engine (src/lib/offline/sync-engine.ts), which is the only caller that
// should invoke them directly — screens go through the queue instead so
// actions survive being offline. Each accepts an `idempotencyKey` (the
// queue item's own id) so a retried request after a flaky partial-success
// doesn't double-submit; see the route files for how each endpoint uses it.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    'Missing EXPO_PUBLIC_API_BASE_URL. Check crew-app/.env.'
  );
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Attaches the current Supabase session's access token as a bearer token —
 * the mobile counterpart to the web app's cookie session. See
 * src/lib/supabase/route-auth.ts on the server side for how routes accept
 * this in addition to (not instead of) the web app's cookie auth.
 */
async function authedFetch(path: string, init?: RequestInit): Promise<unknown> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) {
    throw new ApiError(401, 'Not signed in');
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text || `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.error === 'string') message = parsed.error;
      else if (parsed?.error) message = JSON.stringify(parsed.error);
    } catch {
      // response wasn't JSON — fall back to the raw text set above
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return null;
  return res.json();
}

/** GET /api/crm/crew/visits?date=YYYY-MM-DD — today's schedule for the signed-in crew. */
export async function fetchCrewVisits(date: string): Promise<CrewVisitsResponse> {
  return authedFetch(`/api/crm/crew/visits?date=${encodeURIComponent(date)}`) as Promise<CrewVisitsResponse>;
}

/**
 * POST /api/crm/crew/visits/:id/clock-in. Returns the raw updated DB row
 * (snake_case) — callers that need the list-shaped CrewVisit should refetch
 * fetchCrewVisits() afterwards rather than relying on this response's shape.
 *
 * The route is naturally idempotent (conditional `UPDATE ... WHERE
 * clocked_in_at IS NULL`, 409 if already clocked in) so `idempotencyKey` is
 * passed through only as a request-tracing header, not required for
 * correctness — see the route file for details.
 */
export async function clockInVisit(
  visitId: string,
  localTime: string,
  idempotencyKey: string
): Promise<unknown> {
  return authedFetch(`/api/crm/crew/visits/${visitId}/clock-in`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ localTime }),
  });
}

/**
 * POST /api/crm/crew/visits/:id/clock-out. Same response-shape note as
 * clockInVisit(). The route now guards on `clocked_out_at IS NULL` the same
 * way clock-in guards on `clocked_in_at IS NULL`, returning 409 if the visit
 * was already clocked out (e.g. by a supervisor from the web app) — the
 * sync engine treats that 409 as a conflict, not a transient failure.
 */
export async function clockOutVisit(
  visitId: string,
  localTime: string,
  idempotencyKey: string,
  notes?: string
): Promise<unknown> {
  return authedFetch(`/api/crm/crew/visits/${visitId}/clock-out`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ notes, localTime }),
  });
}

/**
 * POST /api/crm/crew/visits/:id/photos — uploads a local photo file as
 * multipart/form-data, matching the route's expected `file` + `caption`
 * fields. `clientId` (the queue item's id) is sent as an extra field so the
 * route can key the storage path off it and dedupe a retried upload rather
 * than creating a duplicate photo — see the route file.
 */
export async function uploadVisitPhoto(
  visitId: string,
  localUri: string,
  mimeType: string,
  fileName: string,
  clientId: string,
  caption?: string
): Promise<unknown> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) {
    throw new ApiError(401, 'Not signed in');
  }

  const file = new File(localUri);
  const result = await file.upload(`${API_BASE_URL}/api/crm/crew/visits/${visitId}/photos`, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
    parameters: {
      clientId,
      ...(caption ? { caption } : {}),
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Idempotency-Key': clientId,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    let message = result.body || `Upload failed (${result.status})`;
    try {
      const parsed = JSON.parse(result.body);
      if (typeof parsed?.error === 'string') message = parsed.error;
    } catch {
      // response wasn't JSON — fall back to the raw text set above
    }
    throw new ApiError(result.status, message);
  }

  return result.body ? JSON.parse(result.body) : null;
}

/** GET /api/crm/crew/visits/:id/photos — confirmed (already-uploaded) photos for a visit. */
export async function fetchVisitPhotos(visitId: string): Promise<VisitPhoto[]> {
  return authedFetch(`/api/crm/crew/visits/${visitId}/photos`) as Promise<VisitPhoto[]>;
}

/**
 * POST /api/crm/crew/visits/:id/requisitions — creates a single-line draft
 * Requisition for the visit's CRM job (Equipt's "request materials" flow,
 * the crew-app analog of a Work Order spawning a Requisition). Called by
 * the offline sync engine for queued 'request_materials' items — see
 * src/lib/offline/sync-engine.ts — never directly by a screen, so a request
 * made while offline still reaches the server once connectivity returns.
 * `idempotencyKey` is sent for request tracing only; unlike clock-in/out
 * this route has no true dedupe, so a retried request after a flaky
 * partial-success could create a second draft (see the route file).
 */
export async function requestMaterials(
  visitId: string,
  productItemId: string,
  quantity: number,
  idempotencyKey: string,
  note?: string
): Promise<unknown> {
  return authedFetch(`/api/crm/crew/visits/${visitId}/requisitions`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ productItemId, quantity, note }),
  });
}

/** GET /api/crm/crew/visits/:id/requisitions — status list for this visit's "My Requests" section. */
export async function fetchVisitRequisitions(visitId: string): Promise<VisitRequisition[]> {
  return authedFetch(`/api/crm/crew/visits/${visitId}/requisitions`) as Promise<VisitRequisition[]>;
}

/** GET /api/crm/crew/products?q=... — the "Request Materials" product picker's search. */
export async function searchPickerProducts(query: string): Promise<PickerProduct[]> {
  return authedFetch(`/api/crm/crew/products?q=${encodeURIComponent(query)}`) as Promise<PickerProduct[]>;
}

/**
 * POST /api/crm/crew/push-token — registers/refreshes this device's Expo
 * push token. Called by src/lib/notifications.ts on login; storage only,
 * nothing sends a push yet (see the server-side stub at
 * src/lib/notifications/send-push.ts in the web app repo).
 */
export async function registerPushToken(expoPushToken: string): Promise<void> {
  await authedFetch(`/api/crm/crew/push-token`, {
    method: 'POST',
    body: JSON.stringify({ expoPushToken }),
  });
}

/**
 * DELETE /api/crm/crew/push-token — called on sign-out so a stale token row
 * for the signing-out user doesn't survive on this shared device (see
 * unregisterPushToken() in src/lib/notifications.ts).
 */
export async function unregisterPushTokenApi(): Promise<void> {
  await authedFetch(`/api/crm/crew/push-token`, { method: 'DELETE' });
}

/** Returns today's date as YYYY-MM-DD in the device's local timezone. */
export function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
