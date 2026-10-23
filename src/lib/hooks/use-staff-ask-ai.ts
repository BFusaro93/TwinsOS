import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

export type AskAIStatus = "new" | "resolved" | "ignored";
export type AskAIOutcome = "pending" | "full" | "partial" | "none" | "unknown" | "error";

export interface StaffAskAIQuestion {
  id: string;
  orgId: string;
  orgName: string;
  question: string;
  answer: string | null;
  outcome: AskAIOutcome;
  sourceTitles: string[];
  model: string | null;
  escalatedAt: string | null;
  status: AskAIStatus;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  askerName: string | null;
  askerEmail: string | null;
}

/** Every org's logged Ask AI questions. Staff-only — the RPC returns nothing otherwise. */
export function useStaffAskAIQuestions() {
  return useQuery({
    queryKey: ["staff-ask-ai"],
    queryFn: async (): Promise<StaffAskAIQuestion[]> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("staff_list_ask_ai_questions");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map((r) => ({
        id: r.id,
        orgId: r.org_id,
        orgName: r.org_name ?? "Unknown org",
        question: r.question,
        answer: r.answer,
        outcome: r.outcome,
        sourceTitles: r.source_titles ?? [],
        model: r.model,
        escalatedAt: r.escalated_at,
        status: r.status,
        resolution: r.resolution,
        resolvedAt: r.resolved_at,
        createdAt: r.created_at,
        askerName: r.asker_name,
        askerEmail: r.asker_email,
      }));
    },
  });
}

/** Mark a question resolved (with the answer Ask AI should reuse), ignored, or back to new. */
export function useResolveAskAIQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, resolution }: { id: string; status: AskAIStatus; resolution?: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("staff_resolve_ask_ai_question", {
        p_id: id,
        p_status: status,
        p_resolution: resolution ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff-ask-ai"] }),
  });
}
