"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { FeedbackDialog } from "@/components/shared/FeedbackDialog";

/** Matches the pill-button style of the Support page hero's other actions. */
export function SendFeedbackHeaderButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        Send Feedback
      </button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
