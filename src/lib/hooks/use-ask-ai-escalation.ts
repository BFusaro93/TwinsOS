import { useMutation } from "@tanstack/react-query";
import { useSendSupportMessage } from "@/lib/hooks/use-support-chat";
import { useSubmitFeedback } from "@/lib/hooks/use-feedback";
import type { AskAIMessage } from "@/lib/hooks/use-ask-ai";

/** The conversation as plain text, for the support team to read at a glance. */
export function formatAskAITranscript(messages: AskAIMessage[], note: string): string {
  const lines = messages
    .filter((m) => m.content.trim())
    .map((m) => `${m.role === "user" ? "Customer" : "Ask AI"}: ${m.content.trim()}`);
  const header = "Sent from Ask AI — the assistant couldn't fully answer this.";
  return [header, note.trim() ? `Note from customer: ${note.trim()}` : null, "", ...lines]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/**
 * Sends an Ask AI conversation to Landscapt support. Orgs with chat support
 * get it in their support chat thread (where staff reply in-app); everyone
 * else gets it as a feedback submission. support@landscapt.com is emailed
 * once via /api/support/ask/escalate (not the individual staff members, who
 * would otherwise get a second email), and the logged questions are flagged so
 * they surface first in the review tab.
 */
export function useSendAskAIToSupport(opts: { orgId: string; senderName: string; hasChatSupport: boolean }) {
  const sendChat = useSendSupportMessage();
  const submitFeedback = useSubmitFeedback();

  return useMutation({
    mutationFn: async ({ messages, note, pageUrl }: { messages: AskAIMessage[]; note: string; pageUrl: string }) => {
      const body = formatAskAITranscript(messages, note);
      const logIds = messages.map((m) => m.logId).filter((id): id is string => !!id);
      // The escalate route emails support@ (once) for logged questions, so the
      // per-staff email would be a duplicate. If nothing was logged, that route
      // has nothing to email about, so fall back to the normal staff email.
      const notifyStaff = logIds.length === 0;
      if (opts.hasChatSupport) {
        await sendChat.mutateAsync({
          orgId: opts.orgId,
          senderType: "org",
          senderName: opts.senderName,
          body,
          notifyStaff,
        });
      } else {
        await submitFeedback.mutateAsync({ category: "other", message: body, pageUrl, notifyStaff });
      }

      if (logIds.length > 0) {
        // Best-effort: the message is already with support.
        void fetch("/api/support/ask/escalate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logIds }),
        }).catch(() => {});
      }
    },
  });
}
