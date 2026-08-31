"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { FeedbackDialog } from "@/components/shared/FeedbackDialog";

/** Floating action button, fixed to the bottom-right corner of the viewport. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Send Feedback"
        className="fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-colors hover:bg-slate-700 print:hidden"
      >
        <MessageSquarePlus className="h-5 w-5" />
        <span className="sr-only">Send Feedback</span>
      </button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
