"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface PendingSequenceApproval {
  id: string;
  enrollmentId: string;
  sequenceId: string;
  sequenceName: string;
  clientId: string | null;
  clientName: string | null;
  toEmail: string;
  toName: string | null;
  subject: string;
  bodyHtml: string;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return createClient() as unknown as any; }

export function usePendingSequenceApprovals() {
  return useQuery({
    queryKey: ["crm-sequence-approvals", "pending"],
    queryFn: async (): Promise<PendingSequenceApproval[]> => {
      const supabase = db();
      const { data, error } = await supabase
        .from("crm_sequence_step_approvals")
        .select("id, enrollment_id, sequence_id, client_id, to_email, to_name, subject, body_html, created_at, crm_automation_sequences(name), clients(display_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => ({
        id: row.id,
        enrollmentId: row.enrollment_id,
        sequenceId: row.sequence_id,
        sequenceName: row.crm_automation_sequences?.name ?? "Sequence",
        clientId: row.client_id,
        clientName: row.clients?.display_name ?? null,
        toEmail: row.to_email,
        toName: row.to_name,
        subject: row.subject,
        bodyHtml: row.body_html,
        createdAt: row.created_at,
      }));
    },
    refetchInterval: 60_000,
  });
}

export function useDecideSequenceApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" }) => {
      const res = await fetch(`/api/crm/automations/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to record decision");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-sequence-approvals"] });
    },
  });
}
