import type { ConfirmOptions } from "@/components/shared/useConfirm";

/**
 * Browser side of cancelling a project: what it affects, and the "Cancel its N
 * upcoming visits?" question (the same pattern as cancelling a client — see
 * client-visits-api.ts). /api/crm/projects/upcoming-visits does the counting
 * and the cancelling; the database removes the project's pending billing
 * milestones itself when its status becomes canceled.
 */

export interface ProjectCancelPreview {
  /** Untouched visits on the project's jobs that answering Yes would cancel. */
  visits: number;
  /** Pending (not invoiced) billing milestones cancelling removes. */
  pendingMilestones: number;
}

async function post(projectId: string, action: "preview" | "cancel") {
  const res = await fetch("/api/crm/projects/upcoming-visits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, action }),
  });
  const out = (await res.json().catch(() => ({}))) as { count?: number; pendingMilestones?: number; error?: string };
  if (!res.ok) throw new Error(out.error ?? "Failed to check the project's upcoming visits");
  return out;
}

export async function previewProjectCancel(projectId: string): Promise<ProjectCancelPreview> {
  const out = await post(projectId, "preview");
  return { visits: out.count ?? 0, pendingMilestones: out.pendingMilestones ?? 0 };
}

/** Cancels the untouched upcoming visits of the project's jobs; returns how many were cancelled. */
export async function cancelProjectVisitsRemote(projectId: string): Promise<number> {
  const out = await post(projectId, "cancel");
  return out.count ?? 0;
}

export function projectCancelConfirmOptions(pendingMilestones: number): ConfirmOptions {
  return {
    title: "Cancel this project?",
    description:
      `Its ${pendingMilestones} billing milestone${pendingMilestones !== 1 ? "s" : ""} that haven't been invoiced ` +
      "will be removed, so nothing more can be billed from the schedule. Invoiced milestones, invoices and purchase " +
      "orders are kept. Reopening the project does not bring the removed milestones back.",
    confirmLabel: "Cancel project",
    cancelLabel: "Keep project",
    destructive: true,
  };
}

export function projectVisitsConfirmOptions(count: number): ConfirmOptions {
  return {
    title: `Cancel its ${count} upcoming visit${count !== 1 ? "s" : ""}?`,
    description:
      `${count} visit${count !== 1 ? "s" : ""} on this project's jobs that haven't been started or invoiced will be cancelled ` +
      "(recurring visits are removed from the schedule). Completed and in-progress visits are kept. " +
      "Choose No to leave all visits as they are.",
    confirmLabel: "Yes, cancel visits",
    cancelLabel: "No, keep visits",
    destructive: true,
  };
}
