"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { fireStaleIntentCancel } from "@/lib/stripe/stale-intents-client";

/** Rows referencing the duplicate, per table (plus "sub_accounts",
 *  "referrals", "notifications", "crm_campaigns" for un-keyed references). */
export type MergeCounts = Record<string, number>;

export interface MergeClientsResult {
  keptClientId: string;
  mergedClientId: string;
  moved: MergeCounts;
  deduplicated: MergeCounts;
  /** Things that did not carry over (second QuickBooks / Stripe customer,
   *  other email or address) — also written to the kept client's timeline. */
  notes: string[];
}

const LABELS: Record<string, string> = {
  client_properties: "Properties",
  client_contacts: "Contacts",
  crm_jobs: "Jobs",
  crm_job_visits: "Visits",
  estimates: "Estimates",
  crm_contracts: "Contracts",
  crm_invoices: "Invoices",
  crm_payments: "Payments & credits",
  crm_tickets: "Tickets",
  client_activity: "Timeline entries",
  client_files: "Files",
  client_tags: "Tags",
  crm_client_custom_field_values: "Custom field values",
  projects: "Projects",
  photo_jobs: "Photo jobs",
  client_portal_users: "Portal logins",
  client_portal_invites: "Portal invites",
  crm_warranties: "Warranties",
  crm_sales_meetings: "Sales meetings",
  estimate_change_requests: "Estimate change requests",
  crm_form_responses: "Form responses",
  crm_sequence_enrollments: "Automation enrollments",
  crm_sequence_step_approvals: "Automation approvals",
  crm_sequence_execution_log: "Automation history",
  crm_automation_trigger_queue: "Queued automations",
  crm_price_adjustment_lines: "Price adjustment history",
  crm_email_bounces: "Email bounces",
  crm_sms_opt_outs: "SMS opt-outs",
  sub_accounts: "Sub-accounts",
  referrals: "Referred clients",
  notifications: "Notifications",
  crm_campaigns: "Campaign audiences",
};

// The headline records first, the rest alphabetically.
const ORDER = Object.keys(LABELS);

function humanize(key: string): string {
  const s = key.replace(/^crm_/, "").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Counts as display rows, headline records first; zero counts dropped. */
export function describeMergeCounts(counts: MergeCounts): { key: string; label: string; count: number }[] {
  return Object.entries(counts)
    .filter(([, n]) => Number(n) > 0)
    .map(([key, n]) => ({ key, label: LABELS[key] ?? humanize(key), count: Number(n) }))
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.key);
      const ib = ORDER.indexOf(b.key);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.label.localeCompare(b.label);
    });
}

function toCounts(value: unknown): MergeCounts {
  if (!value || typeof value !== "object") return {};
  const out: MergeCounts = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** What would move from `mergeId` onto `keepId`. Read-only; the server
 *  applies the same permission and same-org checks as the merge itself. */
export function useMergeClientsPreview(keepId: string | null, mergeId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["clients", "merge-preview", keepId, mergeId],
    queryFn: async (): Promise<MergeCounts> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("crm_merge_clients_preview", {
        p_keep: keepId as string,
        p_merge: mergeId as string,
      });
      if (error) throw error;
      return toCounts((data as { moved?: unknown } | null)?.moved);
    },
    enabled: enabled && !!keepId && !!mergeId && keepId !== mergeId,
    staleTime: 0,
    retry: false,
  });
}

/** Merges the duplicate into the kept client (crm_merge_clients). */
export function useMergeClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ keepId, mergeId }: { keepId: string; mergeId: string }): Promise<MergeClientsResult> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("crm_merge_clients", { p_keep: keepId, p_merge: mergeId });
      if (error) throw error;
      const row = (data ?? {}) as Record<string, unknown>;
      return {
        keptClientId: keepId,
        mergedClientId: mergeId,
        moved: toCounts(row.moved),
        deduplicated: toCounts(row.deduplicated),
        notes: Array.isArray(row.notes) ? row.notes.filter((n): n is string => typeof n === "string") : [],
      };
    },
    onSuccess: () => {
      // A merge re-homes jobs, visits, invoices, payments, estimates, tickets…
      // across every list in the app. It's rare, so refresh everything; queries
      // that aren't on screen are only marked stale. Not awaited, so the
      // dialog can move on to the kept client right away.
      void qc.invalidateQueries();
      // The duplicate's invoices moved: any open online pay form for them was
      // queued for cancellation by the database — cancel it at Stripe now.
      fireStaleIntentCancel();
    },
  });
}
