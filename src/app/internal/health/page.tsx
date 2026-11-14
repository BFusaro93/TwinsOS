"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchFreshStaffHealth, useStaffHealth } from "@/lib/hooks/use-staff-health";
import type { HealthStatus } from "@/lib/health/checks";

const UPTIME_ROBOT_URL = "https://stats.uptimerobot.com/taTmWtuTlT";

const STATUS_META: Record<HealthStatus, { label: string; dot: string; text: string }> = {
  ok: { label: "Operational", dot: "bg-green-500", text: "text-green-700 dark:text-green-400" },
  degraded: { label: "Degraded", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  down: { label: "Down", dot: "bg-red-500", text: "text-red-700 dark:text-red-400" },
  not_configured: { label: "Not configured", dot: "bg-slate-300 dark:bg-neutral-600", text: "text-muted-foreground" },
};

function dayColor(ratio: number | null): string {
  if (ratio === null) return "bg-slate-200 dark:bg-neutral-700";
  if (ratio >= 99.9) return "bg-green-500";
  if (ratio >= 95) return "bg-amber-500";
  return "bg-red-500";
}

export default function Page() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching } = useStaffHealth();
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refresh() {
    setRefreshing(true);
    try {
      queryClient.setQueryData(["staff-health"], await fetchFreshStaffHealth());
    } finally {
      setRefreshing(false);
    }
  }

  const checks = data?.checks ?? [];
  const configured = checks.filter((c) => c.status !== "not_configured");
  const worst: HealthStatus = configured.some((c) => c.status === "down")
    ? "down"
    : configured.some((c) => c.status === "degraded")
      ? "degraded"
      : "ok";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-neutral-100">System Health</h1>
          <p className="text-sm text-muted-foreground">
            Live checks of our credentials and connections. Vendor-wide outages show in the uptime monitors below.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing || isFetching}>
          {refreshing || isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
          Re-check
        </Button>
      </div>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          Couldn&apos;t load health checks. If this persists, the app itself may be unhealthy.
        </div>
      )}

      {data && (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm">
          <span className={cn("h-3 w-3 rounded-full", STATUS_META[worst].dot)} />
          <span className="font-semibold text-slate-900 dark:text-neutral-100">
            {worst === "ok" ? "All connected services healthy" : worst === "degraded" ? "Some services degraded" : "One or more services down"}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            Checked {new Date(data.checkedAt).toLocaleTimeString()}
          </span>
        </div>
      )}

      <section className="rounded-lg border bg-card shadow-sm">
        <h2 className="border-b px-4 py-3 text-sm font-semibold text-slate-900 dark:text-neutral-100">Connections</h2>
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <ul className="divide-y">
            {checks.map((c) => {
              const meta = STATUS_META[c.status];
              const failures = c.failures ?? [];
              const isOpen = expanded.has(c.id);
              return (
                <li key={c.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">{c.name}</p>
                      {failures.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggle(c.id)}
                          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                          aria-expanded={isOpen}
                        >
                          <ChevronRight className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")} />
                          {c.detail} — {isOpen ? "hide" : "show"} orgs
                        </button>
                      ) : (
                        <p className="truncate text-xs text-muted-foreground">{c.detail}</p>
                      )}
                    </div>
                    {c.latencyMs !== null && <span className="text-xs tabular-nums text-muted-foreground">{c.latencyMs} ms</span>}
                    <span className={cn("w-28 text-right text-xs font-medium", meta.text)}>{meta.label}</span>
                  </div>
                  {isOpen && failures.length > 0 && (
                    <ul className="border-t bg-muted/40 px-4 py-2 pl-10">
                      {failures.map((f) => (
                        <li key={f.label} className="flex items-baseline justify-between gap-4 py-1 text-xs">
                          <span className="font-medium text-slate-800 dark:text-neutral-200">{f.label}</span>
                          <span className="text-muted-foreground">{f.detail}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Uptime monitors (last 30 days)</h2>
          <a
            href={UPTIME_ROBOT_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400"
          >
            Public status page <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {data && data.uptime === null ? (
          <p className="p-4 text-sm text-muted-foreground">UptimeRobot feed unavailable right now.</p>
        ) : (
          <ul className="divide-y">
            {(data?.uptime ?? []).map((m) => (
              <li key={m.name} className="flex items-center gap-4 px-4 py-3">
                <span className="w-44 shrink-0 truncate text-sm text-slate-900 dark:text-neutral-100">{m.name}</span>
                <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {m.ratio30d === null ? "—" : `${m.ratio30d.toFixed(2)}%`}
                </span>
                <div className="flex h-5 flex-1 gap-px">
                  {m.days.map((d) => (
                    <span
                      key={d.date}
                      title={`${d.date}: ${d.ratio === null ? "no data" : `${d.ratio}%`}`}
                      className={cn("flex-1 rounded-sm", dayColor(d.ratio))}
                    />
                  ))}
                </div>
                <span className={cn("w-10 shrink-0 text-right text-xs font-medium", m.status === "up" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>
                  {m.status === "up" ? "Up" : m.status === "down" ? "Down" : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
