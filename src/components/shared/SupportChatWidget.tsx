"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useCurrentUserStore, useChatStore } from "@/stores";
import { useMyConversation, useSupportMessagesRealtime } from "@/lib/hooks/use-support-chat";
import { useAddonAccess } from "@/lib/hooks/use-module-access";
import { ChatDialog } from "@/components/shared/ChatDialog";

const LAST_VIEWED_KEY_PREFIX = "support-chat-last-viewed:";

/**
 * Renders both the floating "continue this conversation" bubble (only once
 * a conversation exists — see FeedbackButton/AskAIButton for the same
 * bottom-right floating-button convention) and the ChatDialog itself. The
 * HelpMenu's "Chat with us" item starts a conversation by opening the same
 * dialog via useChatStore, before any bubble exists yet.
 */
export function SupportChatWidget() {
  const { currentUser } = useCurrentUserStore();
  const { open, setOpen } = useChatStore();
  const { allowed: hasChatSupport } = useAddonAccess("chat_support");
  const { data: messages = [], isLoading } = useMyConversation(
    hasChatSupport ? currentUser.orgId || undefined : undefined
  );
  const [hasUnread, setHasUnread] = useState(false);

  useSupportMessagesRealtime(open ? null : currentUser.orgId || undefined);

  useEffect(() => {
    if (!currentUser.orgId || messages.length === 0) return;
    const lastStaffMessage = [...messages].reverse().find((m) => m.senderType === "staff");
    if (!lastStaffMessage) return;
    const key = LAST_VIEWED_KEY_PREFIX + currentUser.orgId;
    let lastViewed = "0";
    try {
      lastViewed = localStorage.getItem(key) ?? "0";
    } catch {
      // localStorage unavailable — treat as always unread, harmless
    }
    setHasUnread(new Date(lastStaffMessage.createdAt).getTime() > new Date(lastViewed).getTime());
  }, [messages, currentUser.orgId]);

  function handleOpen(next: boolean) {
    setOpen(next);
    if (next && currentUser.orgId) {
      try {
        localStorage.setItem(LAST_VIEWED_KEY_PREFIX + currentUser.orgId, new Date().toISOString());
      } catch {
        // best-effort only
      }
      setHasUnread(false);
    }
  }

  if (!currentUser.orgId || !hasChatSupport) return null;

  return (
    <>
      {messages.length > 0 && !open && (
        <button
          type="button"
          onClick={() => handleOpen(true)}
          title="Continue chat with support"
          className="fixed bottom-36 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg transition-colors hover:bg-brand-600 print:hidden"
        >
          <MessageCircle className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-red-500" />
          )}
          <span className="sr-only">Continue chat with support</span>
        </button>
      )}

      <ChatDialog
        open={open}
        onOpenChange={handleOpen}
        title="Chat with Landscapt Support"
        orgId={currentUser.orgId}
        viewerIsStaff={false}
        viewerName={currentUser.name}
        messages={messages}
        isLoading={isLoading}
      />
    </>
  );
}
