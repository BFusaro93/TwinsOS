import { useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type FeedbackCategory = "bug" | "idea" | "other";

interface SubmitFeedbackInput {
  category: FeedbackCategory;
  message: string;
  pageUrl: string;
  screenshotFile?: File | null;
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: async (input: SubmitFeedbackInput) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      let screenshotPath: string | null = null;
      if (input.screenshotFile) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("id", user.id)
          .single();
        if (profileError || !profile?.org_id) {
          throw new Error("Couldn't verify your organization — please try again");
        }
        const ext = input.screenshotFile.name.split(".").pop() ?? "png";
        const path = `${profile.org_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("feedback-screenshots")
          .upload(path, input.screenshotFile);
        if (uploadError) throw uploadError;
        screenshotPath = path;
      }

      const { data: inserted, error } = await supabase
        .from("feedback")
        .insert({
          created_by: user.id,
          category: input.category,
          message: input.message,
          page_url: input.pageUrl,
          user_agent: navigator.userAgent,
          screenshot_path: screenshotPath,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Email Landscapt staff. Best-effort: the feedback is already saved, so
      // a failed email must never show up as a failed submission.
      void fetch("/api/support/notify-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inserted.id }),
      }).catch(() => {});
    },
  });
}
