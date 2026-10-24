"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useCurrentUserStore, useChatStore } from "@/stores";
import { useMyConversation, useSupportMessagesRealtime } from "@/lib/hooks/use-support-chat";
import { useAddonAccess } from "@/lib/hooks/use-module-access";
import { ChatDialog } from "@/components/shared/ChatDialog";
import { cn } from "@/lib/utils";

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
  const pathname = usePathname();
  const { open, setOpen } = useChatStore();
  const { allowed: hasChatSupportAddon } = useAddonAccess("chat_support");
  // Chat is a private thread per person. Crew logins don't get it.
  const hasChatSupport = hasChatSupportAddon && currentUser.role !== "crew";
  const { data: messages = [], isLoading } = useMyConversation(
    hasChatSupport ? currentUser.orgId || undefined : undefined,
    hasChatSupport ? currentUser.id || undefined : undefined
  );
  const [hasUnread, setHasUnread] = useState(false);

  useSupportMessagesRealtime(open ? null : currentUser.orgId || undefined);

  useEffect(() => {
    if (!currentUser.orgId || messages.length === 0) return;
    const lastStaffMessage = [...messages].reverse().find((m) => m.senderType === "staff");
    if (!lastStaffMessage) return;
    const key = LAST_VIEWED_KEY_PREFIX + currentUser.id;
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
        localStorage.setItem(LAST_VIEWED_KEY_PREFIX + currentUser.id, new Date().toISOString());
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
          className={cn(
            // Bottom-right corner like the other floating buttons. Settings is the only TopBar screen that
            // also mounts the Ask AI and Feedback buttons, so only there does the bubble stack above them.
            "fixed right-[calc(1.25rem+env(safe-area-inset-right))]",
            pathname.startsWith("/settings") ? "bottom-[calc(9rem+env(safe-area-inset-bottom))]" : "bottom-[calc(1.25rem+env(safe-area-inset-bottom))]",
            "z-40 flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg transition-colors hover:bg-brand-600 print:hidden"
          )}
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
