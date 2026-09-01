"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, HelpCircle, LifeBuoy, Mail, MessageSquarePlus, Sparkles } from "lucide-react";
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

/** Single TopBar entry point for Ask AI + Send Feedback, replacing the two
 *  floating circles on every screen that already has a TopBar. Home and the
 *  Settings/Support/Docs screens have no TopBar (or intentionally keep the
 *  floating buttons there instead) — see FeedbackButton / AskAIButton. */
export function HelpMenu() {
  const router = useRouter();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [askAiOpen, setAskAiOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 rounded-full border-slate-200 px-3 text-slate-600 hover:text-slate-900"
            title="Help"
          >
            <HelpCircle className="h-4 w-4" />
            Help
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setAskAiOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4 text-emerald-600" />
            Ask AI
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
            <MessageSquarePlus className="mr-2 h-4 w-4 text-slate-500" />
            Send Feedback
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push("/settings/support")}>
            <LifeBuoy className="mr-2 h-4 w-4 text-slate-500" />
            Support
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/settings/docs")}>
            <BookOpen className="mr-2 h-4 w-4 text-slate-500" />
            Advanced Guides
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Support%20request`}>
              <Mail className="mr-2 h-4 w-4 text-slate-500" />
              {SUPPORT_EMAIL}
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AskAIPanel open={askAiOpen} onOpenChange={setAskAiOpen} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
