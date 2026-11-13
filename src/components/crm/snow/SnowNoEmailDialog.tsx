"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  emailProblem,
  groupVisitsByClient,
  useSnowClients,
} from "@/components/crm/snow/snow-message-shared";
import type { CRMJobVisit } from "@/types/crm-jobs";

/**
 * "Jobs without emails" — the stops on the board (selected ones, or everything
 * shown when nothing is selected) whose client can't be emailed, so the office
 * can fix the client before sending. Mirrors Service Autopilot's report of the
 * same name. One row per client; a client with several stops lists them all.
 */
export function SnowNoEmailDialog({
  open,
  onClose,
  visits,
  scopeLabel,
}: {
  open: boolean;
  onClose: () => void;
  visits: CRMJobVisit[];
  /** "selected" or "shown" — what `visits` represents, for the heading. */
  scopeLabel: string;
}) {
  const groups = useMemo(() => groupVisitsByClient(visits), [visits]);
  const { data: clients, isLoading, isError } = useSnowClients(groups.map((g) => g.clientId), open);

  const problems = useMemo(() => {
    const byId = new Map((clients ?? []).map((c) => [c.id, c] as const));
    return groups
      .map((g) => {
        const client = byId.get(g.clientId);
        if (!client) return null;
        const issue = emailProblem(client);
        return issue ? { group: g, client, issue } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.client.displayName.localeCompare(b.client.displayName));
  }, [groups, clients]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Jobs without emails</DialogTitle>
          <DialogDescription>
            Clients on the {scopeLabel} stops who can&apos;t be emailed. Open the client to add or correct the address.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Checking {groups.length} client{groups.length === 1 ? "" : "s"}…</p>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-red-600 dark:text-red-400">Couldn&apos;t load the clients. Close and try again.</p>
        ) : problems.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Every client on the {scopeLabel} stops has a usable email address.
          </p>
        ) : (
          <div className="max-h-[55vh] overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-muted/40 border-b">
                <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Stop</th>
                  <th className="px-3 py-2">Problem</th>
                </tr>
              </thead>
              <tbody>
                {problems.map(({ group, client, issue }) => (
                  <tr key={client.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/crm/clients/${client.id}`}
                        target="_blank"
                        className="font-medium text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        {client.displayName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[...new Set(group.visits.map((v) => v.job?.serviceAddress).filter(Boolean))].join("; ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {issue === "missing" ? (
                        <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">No email on file</Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-300 text-red-700 dark:border-red-800 dark:text-red-400" title={client.email ?? undefined}>
                          Email bounced{client.email ? ` (${client.email})` : ""}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && !isError && (
          <p className="text-[11px] text-muted-foreground">
            {problems.length} of {groups.length} client{groups.length === 1 ? "" : "s"} can&apos;t be emailed.
            Clients who opted out of marketing can still get snow service notices.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
