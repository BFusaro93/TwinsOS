"use client";

import { useState } from "react";
import { Bug, Lightbulb, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useStaffFeedback,
  useSetFeedbackStatus,
  useFeedbackScreenshotUrl,
  type FeedbackStatus,
  type StaffFeedbackItem,
} from "@/lib/hooks/use-staff-feedback";

const CATEGORY_META = {
  bug: { label: "Bug", icon: Bug, className: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400" },
  idea: { label: "Idea", icon: Lightbulb, className: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400" },
  other: { label: "Other", icon: MessageSquare, className: "bg-muted text-slate-600 dark:text-neutral-400" },
} as const;

const STATUS_LABELS: Record<FeedbackStatus, string> = { new: "New", reviewed: "Reviewed", closed: "Closed" };

const FILTERS: { value: FeedbackStatus | "all"; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

function Screenshot({ path }: { path: string }) {
  const { data: url, isLoading } = useFeedbackScreenshotUrl(path);
  if (isLoading) return <Skeleton className="h-40 w-full max-w-sm" />;
  if (!url) return <p className="text-xs text-slate-400 dark:text-neutral-500">Screenshot unavailable</p>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Feedback screenshot" className="max-h-80 w-auto max-w-full rounded-md border" />
    </a>
  );
}

function FeedbackCard({ item }: { item: StaffFeedbackItem }) {
  const setStatus = useSetFeedbackStatus();
  const meta = CATEGORY_META[item.category] ?? CATEGORY_META.other;
  const Icon = meta.icon;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("border-transparent", "gap-1", meta.className)}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
        <span className="text-sm font-medium text-slate-800 dark:text-neutral-100">{item.orgName}</span>
        <span className="text-xs text-muted-foreground">
          {item.submitterName ?? item.submitterEmail ?? "Unknown user"} · {new Date(item.createdAt).toLocaleString()}
        </span>
        <Badge variant="outline" className="ml-auto">{STATUS_LABELS[item.status]}</Badge>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800 dark:text-neutral-100">{item.message}</p>
      {item.pageUrl && <p className="mt-2 font-mono text-xs text-slate-400 dark:text-neutral-500">{item.pageUrl}</p>}
      {item.screenshotPath && <div className="mt-3"><Screenshot path={item.screenshotPath} /></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {(["new", "reviewed", "closed"] as const)
          .filter((s) => s !== item.status)
          .map((s) => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id: item.id, status: s })}
            >
              Mark {STATUS_LABELS[s].toLowerCase()}
            </Button>
          ))}
      </div>
    </div>
  );
}

export default function StaffFeedbackPage() {
  const { data: items = [], isLoading, error } = useStaffFeedback();
  const [filter, setFilter] = useState<FeedbackStatus | "all">("new");

  const visible = items.filter((i) => filter === "all" || i.status === filter);
  const newCount = items.filter((i) => i.status === "new").length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Bug reports &amp; ideas</h1>
        <p className="text-sm text-muted-foreground">Submitted from the feedback button in every org. {newCount} new.</p>
      </div>
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.value ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="text-sm text-destructive">Couldn&apos;t load feedback.</p>
      ) : isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400 dark:text-neutral-500">Nothing here.</p>
      ) : (
        visible.map((item) => <FeedbackCard key={item.id} item={item} />)
      )}
    </div>
  );
}
