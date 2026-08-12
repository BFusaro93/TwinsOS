"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePendingSequenceApprovals, useDecideSequenceApproval } from "@/lib/hooks/use-sequence-approvals";
import { toast } from "sonner";

export function PendingApprovalsButton() {
  const [open, setOpen] = useState(false);
  const { data: approvals } = usePendingSequenceApprovals();
  const decide = useDecideSequenceApproval();

  const count = approvals?.length ?? 0;

  async function handleDecide(id: string, action: "approve" | "reject") {
    try {
      await decide.mutateAsync({ id, action });
      toast.success(action === "approve" ? "Email sent" : "Step rejected — sequence stopped");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record decision");
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Inbox className="h-4 w-4" />
        Approvals
        {count > 0 && <Badge className="ml-1 px-1.5">{count}</Badge>}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full max-w-lg">
          <SheetHeader>
            <SheetTitle>Pending Email Approvals</SheetTitle>
          </SheetHeader>

          <ScrollArea className="mt-4 h-[calc(100vh-8rem)] pr-3">
            {count === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Nothing waiting on approval.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {approvals!.map((a) => (
                  <div key={a.id} className="rounded-md border border-slate-200 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {a.sequenceName}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(a.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">{a.subject}</p>
                    <p className="text-xs text-slate-500">
                      To: {a.toName ? `${a.toName} <${a.toEmail}>` : a.toEmail}
                    </p>
                    <div
                      className="mt-2 max-h-32 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600"
                      dangerouslySetInnerHTML={{ __html: a.bodyHtml || "<em>(empty body)</em>" }}
                    />
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-red-600 hover:text-red-700"
                        disabled={decide.isPending}
                        onClick={() => handleDecide(a.id, "reject")}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={decide.isPending}
                        onClick={() => handleDecide(a.id, "approve")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve & Send
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
