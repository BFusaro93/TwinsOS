"use client";

import { useState } from "react";
import { HelpCircle, MessageSquarePlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeedbackDialog } from "@/components/shared/FeedbackDialog";
import { AskAIPanel } from "@/components/shared/AskAIPanel";

/** Single TopBar entry point for Ask AI + Send Feedback, replacing the two
 *  floating circles on every screen that already has a TopBar. Home and the
 *  Settings/Support/Docs screens have no TopBar (or intentionally keep the
 *  floating buttons there instead) — see FeedbackButton / AskAIButton. */
export function HelpMenu() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [askAiOpen, setAskAiOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 text-slate-500" title="Help">
            <HelpCircle className="h-5 w-5" />
            <span className="sr-only">Help</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setAskAiOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4 text-emerald-600" />
            Ask AI
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
            <MessageSquarePlus className="mr-2 h-4 w-4 text-slate-500" />
            Send Feedback
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AskAIPanel open={askAiOpen} onOpenChange={setAskAiOpen} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
