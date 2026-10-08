"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, HelpCircle, LifeBuoy, Mail, MessageCircle, MessageSquarePlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeedbackDialog } from "@/components/shared/FeedbackDialog";
import { AskAIPanel } from "@/components/shared/AskAIPanel";
import { SUPPORT_EMAIL } from "@/components/marketing/config";
import { useChatStore } from "@/stores";
import { useAddonAccess } from "@/lib/hooks/use-module-access";

/** Single TopBar entry point for Ask AI + Send Feedback, replacing the two
 *  floating circles on every screen that already has a TopBar. Home and the
 *  Settings/Support/Docs screens have no TopBar (or intentionally keep the
 *  floating buttons there instead) — see FeedbackButton / AskAIButton.
 *  "Chat with us" starts a support conversation via SupportChatWidget
 *  (mounted once in TopBar) — once it has messages, a floating chat bubble
 *  takes over as the way back in, same as this menu's other entry points. */
export function HelpMenu() {
  const router = useRouter();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [askAiOpen, setAskAiOpen] = useState(false);
  const { setOpen: setChatOpen } = useChatStore();
  const { allowed: hasChatSupport } = useAddonAccess("chat_support");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 rounded-full border-border px-2.5 sm:px-3 text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100"
            title="Help"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Help</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setAskAiOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Ask AI
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
            <MessageSquarePlus className="mr-2 h-4 w-4 text-muted-foreground" />
            Send Feedback
          </DropdownMenuItem>
          {hasChatSupport && (
            <DropdownMenuItem onSelect={() => setChatOpen(true)}>
              <MessageCircle className="mr-2 h-4 w-4 text-brand-600 dark:text-brand-400" />
              Chat with us
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push("/settings/support")}>
            <LifeBuoy className="mr-2 h-4 w-4 text-muted-foreground" />
            Support
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/settings/docs")}>
            <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
            Advanced Guides
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Support%20request`}>
              <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
              Email Support
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AskAIPanel open={askAiOpen} onOpenChange={setAskAiOpen} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
