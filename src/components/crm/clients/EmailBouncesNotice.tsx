"use client";

import { MailX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useClearEmailBounce, useClientEmailBounces } from "@/lib/hooks/use-email-bounces";
import { mutationErrorMessage } from "@/lib/utils/mutation-error";

/**
 * Lists this client's hard-bounced email addresses. Each one is skipped on
 * every send (campaigns, automations, invoices, estimates, statements) while
 * the client's other addresses keep receiving mail. "Clear bounce" is for when
 * the office knows the mailbox works again; a new, corrected address needs no
 * clearing.
 */
export function EmailBouncesNotice({
  clientId,
  addresses,
  canClear,
}: {
  clientId: string;
  addresses: (string | null | undefined)[];
  canClear: boolean;
}) {
  const { data: bounces = [] } = useClientEmailBounces(clientId, addresses);
  const clear = useClearEmailBounce();
  if (bounces.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-800 dark:text-red-300">
      <div className="flex items-center gap-1.5 font-medium">
        <MailX className="h-3.5 w-3.5 shrink-0" />
        {bounces.length === 1 ? "This address hard-bounced and won't be emailed:" : "These addresses hard-bounced and won't be emailed:"}
      </div>
      <ul className="mt-1 space-y-1">
        {bounces.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 break-all" title={b.bounceMessage ?? undefined}>
              {b.email}
              <span className="ml-1 text-red-600/80 dark:text-red-400/80">
                · {new Date(b.bouncedAt).toLocaleDateString()}
              </span>
            </span>
            {canClear && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                disabled={clear.isPending}
                onClick={() =>
                  clear.mutate(
                    { email: b.email, clientId },
                    {
                      onSuccess: () => toast.success(`Bounce cleared — ${b.email} will be emailed again`),
                      onError: (err) => toast.error(mutationErrorMessage(err, "Couldn't clear the bounce")),
                    },
                  )
                }
              >
                Clear bounce
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-red-700/80 dark:text-red-400/80">
        The client&apos;s other addresses still get email. Clear a bounce only once the mailbox is fixed; a new address needs no clearing.
      </p>
    </div>
  );
}
