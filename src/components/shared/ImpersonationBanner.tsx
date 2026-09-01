"use client";

import { UserCog } from "lucide-react";
import { useIsStaff, useActiveImpersonationSession, useEndImpersonation } from "@/lib/hooks/use-impersonation";

/**
 * Always-visible while a session is active — unlike TrialBanner this is a
 * safety indicator, not marketing, so there's no dismiss/localStorage
 * suppression. Mounted once in TopBar, which every authenticated shell
 * (dashboard/CRM/settings/photos/reports/tools) already renders.
 */
export function ImpersonationBanner() {
  const { data: isStaff } = useIsStaff();
  const { data: session } = useActiveImpersonationSession();
  const endImpersonation = useEndImpersonation();

  if (!isStaff || !session) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
      <span className="flex items-center gap-2">
        <UserCog className="h-4 w-4 shrink-0" />
        Impersonating <strong>{session.targetOrgName}</strong>
      </span>
      <button
        type="button"
        onClick={() => endImpersonation.mutate(session.id)}
        disabled={endImpersonation.isPending}
        className="shrink-0 rounded-md border border-white/40 bg-white/10 px-3 py-1 text-xs font-semibold transition-colors hover:bg-white/20 disabled:opacity-60"
      >
        {endImpersonation.isPending ? "Ending…" : "End Session"}
      </button>
    </div>
  );
}
