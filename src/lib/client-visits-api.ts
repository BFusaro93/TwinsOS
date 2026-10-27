import type { ConfirmOptions } from "@/components/shared/useConfirm";

/**
 * Browser side of the "Cancel their N upcoming visits?" question asked when a
 * client is cancelled or deleted. The server route
 * (/api/crm/clients/upcoming-visits) does the counting and the cancelling.
 */

async function post(clientIds: string[], action: "preview" | "cancel"): Promise<number> {
  const res = await fetch("/api/crm/clients/upcoming-visits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientIds, action }),
  });
  const out = (await res.json().catch(() => ({}))) as { count?: number; error?: string };
  if (!res.ok) throw new Error(out.error ?? "Failed to check upcoming visits");
  return out.count ?? 0;
}

/** How many visits answering Yes would cancel. 0 when nothing qualifies (or the caller can't ask). */
export function previewClientVisits(clientIds: string[]): Promise<number> {
  return clientIds.length === 0 ? Promise.resolve(0) : post(clientIds, "preview");
}

/** Cancels the untouched upcoming visits of the given clients; returns how many were cancelled. */
export function cancelClientVisitsRemote(clientIds: string[]): Promise<number> {
  return clientIds.length === 0 ? Promise.resolve(0) : post(clientIds, "cancel");
}

export function clientVisitsConfirmOptions(count: number, opts: { deleting?: boolean } = {}): ConfirmOptions {
  return {
    title: `Cancel their ${count} upcoming visit${count !== 1 ? "s" : ""}?`,
    description:
      `${count} visit${count !== 1 ? "s" : ""} that haven't been started or invoiced will be cancelled ` +
      "(recurring and package visits are removed from the schedule). Completed and in-progress visits are kept. " +
      (opts.deleting
        ? "Choose No to leave them as they are."
        : "Reactivating the client later resumes recurring visits automatically, but one-time visits cancelled now are not restored. Choose No to leave all visits as they are."),
    confirmLabel: "Yes, cancel visits",
    cancelLabel: "No, keep visits",
    destructive: true,
  };
}
