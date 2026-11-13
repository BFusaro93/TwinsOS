"use client";

import { Mail } from "lucide-react";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface SentEmailSummary {
  /** client_activity.id of the email row. */
  id: string;
  subject: string | null;
  sentTo: string | null;
  occurredAt: string;
  /** Legacy one-line summary, shown when the sent HTML wasn't kept. */
  summary?: string | null;
}

function useSentEmailContent(activityId: string | null) {
  return useQuery({
    queryKey: ["client-email-content", activityId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("client_email_content")
        .select("html, cc")
        .eq("activity_id", activityId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { html: string; cc: string | null } | null;
    },
    enabled: !!activityId,
  });
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** Read-only view of a sent email: recipients, subject and the HTML as delivered. */
export function SentEmailDialog({
  email,
  onClose,
}: {
  email: SentEmailSummary | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useSentEmailContent(email?.id ?? null);

  return (
    <Dialog open={!!email} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 shrink-0" />
            <span className="truncate">{email?.subject ?? "Email"}</span>
          </DialogTitle>
        </DialogHeader>
        {email && (
          <div className="space-y-3">
            <dl className="grid grid-cols-[4.5rem_1fr] gap-y-1 text-sm">
              <dt className="text-muted-foreground">To</dt>
              <dd className="break-words">{email.sentTo ?? "—"}</dd>
              {data?.cc && (<><dt className="text-muted-foreground">Cc</dt><dd className="break-words">{data.cc}</dd></>)}
              <dt className="text-muted-foreground">Sent</dt>
              <dd>{fmt(email.occurredAt)}</dd>
            </dl>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : data?.html ? (
              // Sandboxed with no scripts: the HTML is merge-tag-expanded org/client
              // text, so it must not run anything or reach this page.
              <iframe
                title="Sent email"
                sandbox=""
                srcDoc={data.html}
                className="h-[60vh] w-full rounded-md border bg-white"
              />
            ) : (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                {isError
                  ? "Couldn't load this email's content."
                  : "The content of this email wasn't saved. Only emails sent after this feature shipped can be viewed."}
                {email.summary && <p className="mt-2 whitespace-pre-line text-slate-600 dark:text-neutral-400">{email.summary}</p>}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
