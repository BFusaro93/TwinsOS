import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Helpers for linking EXISTING jobs to a contract (crm_jobs.contract_id).
 *
 * Linking changes billing from that moment on: the job's services are billed
 * inside the contract price, so its future completed visits get no separate
 * invoice (materials still follow each product's "In contract" flag). Visits
 * that were already completed and not invoiced are NOT touched — they are
 * neither billed retroactively nor released here. (For a draft / sent
 * contract they are released when it is signed or cancelled, by
 * /api/crm/contracts/[id]/release-held-visits.)
 */

/** Job types that can sit under a contract. Snow bills through Snow Invoicing, projects through milestones. */
export const CONTRACT_LINKABLE_JOB_TYPES = ["recurring", "package", "one_time"] as const;

const IN_CHUNK = 100;

/**
 * Per job: how many COMPLETED lead visits have no live invoice line — the
 * visits a contract link will not bill. Same "live line" rule as the
 * release-held-visits route (a line on a void / deleted invoice doesn't count).
 */
export async function countCompletedUninvoicedVisits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  jobIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>(jobIds.map((id) => [id, 0]));
  if (jobIds.length === 0) return counts;

  const visits: { id: string; job_id: string }[] = [];
  for (let i = 0; i < jobIds.length; i += IN_CHUNK) {
    const chunk = jobIds.slice(i, i + IN_CHUNK);
    const rows = await fetchAllRows<{ id: string; job_id: string }>(() =>
      supabase
        .from("crm_job_visits")
        .select("id, job_id")
        .in("job_id", chunk)
        .eq("status", "completed")
        .eq("crew_group_secondary", false)
        .is("deleted_at", null)
        .order("id", { ascending: true }),
    );
    visits.push(...rows);
  }

  const billed = new Set<string>();
  for (let i = 0; i < visits.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from("crm_invoice_line_items")
      .select("visit_id, crm_invoices(status, deleted_at)")
      .in("visit_id", visits.slice(i, i + IN_CHUNK).map((v) => v.id));
    if (error) throw error;
    for (const l of (data ?? []) as unknown as { visit_id: string; crm_invoices: { status: string; deleted_at: string | null } | null }[]) {
      if (l.crm_invoices && l.crm_invoices.deleted_at == null && l.crm_invoices.status !== "void") billed.add(l.visit_id);
    }
  }
  for (const v of visits) {
    if (!billed.has(v.id)) counts.set(v.job_id, (counts.get(v.job_id) ?? 0) + 1);
  }
  return counts;
}

/** Does a job service match one of the contract's covered services (by id, else by name)? */
export function jobServiceIsCovered(
  svc: { service_id: string | null; service_name: string | null },
  covered: { serviceId: string | null; serviceName: string }[],
): boolean {
  const name = (svc.service_name ?? "").trim().toLowerCase();
  return covered.some((c) =>
    (c.serviceId && svc.service_id && c.serviceId === svc.service_id) ||
    (!!name && c.serviceName.trim().toLowerCase() === name),
  );
}
