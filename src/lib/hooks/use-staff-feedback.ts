import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

export type FeedbackStatus = "new" | "reviewed" | "closed";

export interface StaffFeedbackItem {
  id: string;
  orgId: string;
  orgName: string;
  category: "bug" | "idea" | "other";
  message: string;
  pageUrl: string | null;
  userAgent: string | null;
  screenshotPath: string | null;
  status: FeedbackStatus;
  createdAt: string;
  submitterName: string | null;
  submitterEmail: string | null;
}

/** Every org's feedback submissions. Staff-only — the RPC returns nothing otherwise. */
export function useStaffFeedback() {
  return useQuery({
    queryKey: ["staff-feedback"],
    queryFn: async (): Promise<StaffFeedbackItem[]> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("staff_list_feedback");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map((r) => ({
        id: r.id,
        orgId: r.org_id,
        orgName: r.org_name ?? "Unknown org",
        category: r.category,
        message: r.message,
        pageUrl: r.page_url,
        userAgent: r.user_agent,
        screenshotPath: r.screenshot_path,
        status: r.status,
        createdAt: r.created_at,
        submitterName: r.submitter_name,
        submitterEmail: r.submitter_email,
      }));
    },
  });
}

export function useSetFeedbackStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FeedbackStatus }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("staff_set_feedback_status", { p_id: id, p_status: status });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff-feedback"] }),
  });
}

/** Short-lived signed URL for a screenshot in the private feedback-screenshots bucket. */
export function useFeedbackScreenshotUrl(path: string | null) {
  return useQuery({
    queryKey: ["feedback-screenshot", path],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.storage.from("feedback-screenshots").createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
  });
}
