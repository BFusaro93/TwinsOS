/**
 * Push-notification triggers for crm_job_visits changes — new crew
 * assignment and dispatcher notes. Shared by the two server-side surfaces
 * that write crew_id / notes_to_crew on a visit:
 *   - src/app/api/crm/visits/[visitId]/route.ts (single + bulk re-assign,
 *     status updates, notes — DispatchBoard.tsx's bulk actions and the
 *     "Notes to Crew" dialog both go through this route)
 *   - src/app/api/crm/visits/[visitId]/notify/route.ts (a lightweight
 *     fire-and-forget endpoint for the single-visit assignment/notes paths
 *     that update crm_job_visits directly via useUpdateVisit()'s
 *     client-side Supabase call rather than the PATCH route above — see
 *     that route's doc comment for why a separate endpoint exists)
 *
 * Both callers already know the visit was just written; this module's job
 * is purely "look up who to notify and send it" — it never writes to
 * crm_job_visits itself. All lookups use the service-role client since the
 * crew's user_id (crm_crews.user_id) and the crew_push_tokens row belong to
 * a different user than whoever is dispatching.
 */

import { adminClient } from "@/lib/api/auth";
import { sendPushToUser } from "@/lib/notifications/send-push";

function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return "";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${(mStr ?? "00").padStart(2, "0")} ${period}`;
}

async function resolveCrewUserId(crewId: string): Promise<string | null> {
  const db = adminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any).from("crm_crews").select("user_id").eq("id", crewId).maybeSingle();
  return (data?.user_id as string | null | undefined) ?? null;
}

async function resolveClientName(clientId: string | null | undefined): Promise<string> {
  if (!clientId) return "a client";
  const db = adminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any).from("clients").select("display_name").eq("id", clientId).maybeSingle();
  return (data?.display_name as string | undefined) || "a client";
}

export interface NotifyVisitAssignedInput {
  visitId: string;
  crewId: string;
  clientId?: string | null;
  scheduledDate?: string | null;
  startTime?: string | null;
}

/** New assignment — crm_job_visits.crew_id was set to a non-null crew. */
export async function notifyVisitAssigned(input: NotifyVisitAssignedInput): Promise<void> {
  try {
    const userId = await resolveCrewUserId(input.crewId);
    if (!userId) return; // crew has no linked login, or that login has no push token

    const clientName = await resolveClientName(input.clientId);
    const dateLabel = input.scheduledDate
      ? new Date(`${input.scheduledDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";
    const timeLabel = formatTime(input.startTime);
    const when = [dateLabel, timeLabel].filter(Boolean).join(" ");

    await sendPushToUser({
      userId,
      title: "New Job Assigned",
      body: when ? `${clientName} — ${when}` : clientName,
      data: { type: "visit_assigned", visitId: input.visitId },
    });
  } catch (err) {
    console.error("[notifyVisitAssigned] failed", { visitId: input.visitId, err: err instanceof Error ? err.message : String(err) });
  }
}

export interface NotifyVisitNoteInput {
  visitId: string;
  crewId: string;
  clientId?: string | null;
  note: string;
}

/** Dispatcher note — crm_job_visits.notes_to_crew was set on an assigned visit. */
export async function notifyVisitNote(input: NotifyVisitNoteInput): Promise<void> {
  try {
    const userId = await resolveCrewUserId(input.crewId);
    if (!userId) return;

    const clientName = await resolveClientName(input.clientId);
    const preview = input.note.length > 100 ? `${input.note.slice(0, 100)}…` : input.note;

    await sendPushToUser({
      userId,
      title: "Note from Dispatch",
      body: `${clientName}: ${preview}`,
      data: { type: "visit_note", visitId: input.visitId },
    });
  } catch (err) {
    console.error("[notifyVisitNote] failed", { visitId: input.visitId, err: err instanceof Error ? err.message : String(err) });
  }
}
