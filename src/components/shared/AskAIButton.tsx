"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { AskAIPanel } from "@/components/shared/AskAIPanel";

/** Floating action button for the Ask AI support widget. Mounted on Home
 *  (no TopBar there) and, deliberately in addition to the TopBar Help menu,
 *  on Settings/Support/Docs. Offset above FeedbackButton's bottom-5 right-5
 *  since both appear together. */
export function AskAIButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ask AI"
        className="fixed bottom-20 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg transition-colors hover:bg-emerald-600 print:hidden"
      >
        <Sparkles className="h-5 w-5" />
        <span className="sr-only">Ask AI</span>
      </button>
      <AskAIPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
