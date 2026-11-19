"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuery } from "@/lib/hooks/use-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OrgFeeRow {
  id: string;
  name: string;
  platformFeeBps: number;
  stripeConnected: boolean;
  userCount: number;
  lastChange: { by: string | null; at: string; description: string | null } | null;
}

/** bps → "0.10%" */
function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function FeeRow({ org }: { org: OrgFeeRow }) {
  const queryClient = useQueryClient();
  // Edited as a percent string ("0.1"); stored as integer basis points.
  const [value, setValue] = useState((org.platformFeeBps / 100).toString());

  const parsedBps = Math.round(parseFloat(value) * 100);
  const valid = Number.isFinite(parsedBps) && parsedBps >= 0 && parsedBps <= 100;
  const dirty = valid && parsedBps !== org.platformFeeBps;

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/internal/platform-fees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id, platformFeeBps: parsedBps }),
      });
      if (!res.ok) throw new Error("Couldn't update the fee");
    },
    onSuccess: () => {
      toast.success(`${org.name}: platform fee set to ${formatBps(parsedBps)}`);
      queryClient.invalidateQueries({ queryKey: ["staff-platform-fees"] });
    },
    onError: () => toast.error("Couldn't update the fee."),
  });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900 dark:text-neutral-100">{org.name}</div>
        <div className="text-xs text-muted-foreground">
          {org.stripeConnected ? "Stripe connected" : "No Stripe account"} · currently {formatBps(org.platformFeeBps)}
        </div>
        {org.lastChange && (
          <div className="text-xs text-muted-foreground">
            Last changed {new Date(org.lastChange.at).toLocaleDateString()}
            {org.lastChange.by ? ` by ${org.lastChange.by}` : ""}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          max={1}
          className="w-24"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Platform fee percent for ${org.name}`}
        />
        <span className="text-sm text-muted-foreground">%</span>
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export default function PlatformFeesPage() {
  const [search, setSearch] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["staff-platform-fees"],
    queryFn: async (): Promise<OrgFeeRow[]> => {
      const res = await fetch("/api/internal/platform-fees");
      if (!res.ok) throw new Error("Couldn't load organizations");
      const body = (await res.json()) as { orgs: OrgFeeRow[] };
      return body.orgs;
    },
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Platform fee</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The share of every card payment (the total charged to the client; bank/ACH payments carry no fee) that goes to the platform, per
          organization. 0.10% is the standard rate for new organizations; existing ones were left at 0. Changes apply
          to payments created after you save, and a refund returns the fee in proportion. Maximum 1%.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          placeholder="Search organizations…"
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search organizations"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
          Show orgs with no users
        </label>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm text-destructive">Couldn&apos;t load organizations.</p>
      ) : (
        (() => {
          const q = search.trim().toLowerCase();
          const rows = data.filter(
            (o) => (showEmpty || o.userCount > 0 || q !== "") && (!q || o.name.toLowerCase().includes(q))
          );
          return rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organizations match.</p>
          ) : (
            rows.map((org) => <FeeRow key={`${org.id}:${org.platformFeeBps}`} org={org} />)
          );
        })()
      )}
    </div>
  );
}
