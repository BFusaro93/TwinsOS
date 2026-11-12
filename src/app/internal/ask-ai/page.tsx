"use client";

import { useState } from "react";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useStaffAskAIQuestions,
  useResolveAskAIQuestion,
  type AskAIOutcome,
  type StaffAskAIQuestion,
} from "@/lib/hooks/use-staff-ask-ai";

type Filter = "needs-answer" | "resolved" | "ignored" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "needs-answer", label: "Needs an answer" },
  { value: "resolved", label: "Resolved" },
  { value: "ignored", label: "Ignored" },
  { value: "all", label: "All" },
];

const OUTCOME_META: Record<AskAIOutcome, { label: string; className: string }> = {
  full: { label: "Answered", className: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400" },
  partial: { label: "Partial", className: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400" },
  none: { label: "Not covered", className: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400" },
  unknown: { label: "Unrated", className: "bg-muted text-slate-600 dark:text-neutral-400" },
  pending: { label: "Incomplete", className: "bg-muted text-slate-600 dark:text-neutral-400" },
  error: { label: "Error", className: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400" },
};

/** A new question the docs did not fully cover, or one the customer escalated. */
function needsAnswer(q: StaffAskAIQuestion): boolean {
  if (q.status !== "new") return false;
  return !!q.escalatedAt || q.outcome === "none" || q.outcome === "partial" || q.outcome === "error";
}

function QuestionCard({ item }: { item: StaffAskAIQuestion }) {
  const resolve = useResolveAskAIQuestion();
  const [resolution, setResolution] = useState(item.resolution ?? "");
  const [showReply, setShowReply] = useState(false);
  const meta = OUTCOME_META[item.outcome] ?? OUTCOME_META.unknown;

  async function save(status: "resolved" | "ignored" | "new") {
    try {
      await resolve.mutateAsync({ id: item.id, status, resolution });
      toast.success(
        status === "resolved" ? "Saved — Ask AI will use this answer from now on." : status === "ignored" ? "Ignored." : "Reopened."
      );
    } catch {
      toast.error("Couldn't save.");
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("border-transparent", meta.className)}>{meta.label}</Badge>
        {item.escalatedAt && (
          <Badge variant="outline" className="border-transparent gap-1 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">
            <LifeBuoy className="h-3 w-3" />
            Sent to support
          </Badge>
        )}
        <span className="text-sm font-medium text-slate-800 dark:text-neutral-100">{item.orgName}</span>
        <span className="text-xs text-muted-foreground">
          {item.askerName ?? item.askerEmail ?? "Unknown user"} · {new Date(item.createdAt).toLocaleString()}
        </span>
        {item.status !== "new" && (
          <Badge variant="outline" className="ml-auto capitalize">
            {item.status}
          </Badge>
        )}
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm font-medium text-slate-900 dark:text-neutral-100">{item.question}</p>

      {item.answer && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowReply((v) => !v)}
            className="text-xs font-medium text-muted-foreground hover:underline"
          >
            {showReply ? "Hide" : "Show"} what Ask AI replied
          </button>
          {showReply && (
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 dark:bg-muted/40 p-3 text-sm text-slate-700 dark:text-neutral-300">{item.answer}</p>
          )}
        </div>
      )}
      {item.sourceTitles.length > 0 && (
        <p className="mt-2 text-xs text-slate-400 dark:text-neutral-500">Searched: {item.sourceTitles.join(" · ")}</p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <label className="text-xs font-medium text-slate-600 dark:text-neutral-400" htmlFor={`res-${item.id}`}>
          Correct answer (Ask AI reuses this for similar questions in every organization, so keep it generic: no customer, client, employee or company names)
        </label>
        <Textarea
          id={`res-${item.id}`}
          rows={3}
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="Write the answer you'd give the customer, with the exact menu path…"
          className="text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={resolve.isPending || !resolution.trim()} onClick={() => save("resolved")}>
            {item.status === "resolved" ? "Update answer" : "Save answer"}
          </Button>
          {item.status === "new" ? (
            <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => save("ignored")}>
              Ignore
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => save("new")}>
              Reopen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface Conversation {
  key: string;
  items: StaffAskAIQuestion[]; // oldest first, so it reads top to bottom
  latest: string;
  escalated: boolean;
}

/**
 * Rows from one chat share a conversationId. Rows logged before grouping
 * existed have none, so each is its own single-question conversation.
 */
function groupConversations(rows: StaffAskAIQuestion[]): Conversation[] {
  const byKey = new Map<string, StaffAskAIQuestion[]>();
  for (const q of rows) {
    const key = q.conversationId ?? q.id;
    const list = byKey.get(key);
    if (list) list.push(q);
    else byKey.set(key, [q]);
  }
  return [...byKey.entries()].map(([key, list]) => {
    const items = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      key,
      items,
      latest: items[items.length - 1].createdAt,
      escalated: items.some((q) => !!q.escalatedAt),
    };
  });
}

function ConversationBlock({ conversation }: { conversation: Conversation }) {
  const { items } = conversation;
  const first = items[0];
  if (items.length === 1) return <QuestionCard item={first} />;
  return (
    <div className="rounded-lg border border-dashed p-2">
      <p className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">
        One conversation · {items.length} questions · {first.orgName} · {first.askerName ?? first.askerEmail ?? "Unknown user"}
      </p>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <QuestionCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border-b pb-1 pt-2">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-neutral-100">{title}</h2>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function StaffAskAIPage() {
  const { data: items = [], isLoading, error } = useStaffAskAIQuestions();
  const [filter, setFilter] = useState<Filter>("needs-answer");

  // A conversation is shown whole when any of its questions matches the filter,
  // so a flagged question keeps the follow-ups around it for context.
  const matching = items.filter((q) => {
    if (filter === "all") return true;
    if (filter === "needs-answer") return needsAnswer(q);
    return q.status === filter;
  });
  const matchingKeys = new Set(matching.map((q) => q.conversationId ?? q.id));
  const conversations = groupConversations(items.filter((q) => matchingKeys.has(q.conversationId ?? q.id)));
  const byNewest = (a: Conversation, b: Conversation) => b.latest.localeCompare(a.latest);
  // Sent-to-support conversations come first: those customers are waiting on a reply.
  const sentToSupport = conversations.filter((c) => c.escalated).sort(byNewest);
  const others = conversations.filter((c) => !c.escalated).sort(byNewest);
  const needsCount = items.filter(needsAnswer).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Ask AI questions</h1>
        <p className="text-sm text-muted-foreground">
          Questions the in-app assistant couldn&apos;t fully answer from the help docs. Write the answer once and it
          answers the same question for everyone after. {needsCount} need an answer.
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.value ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="text-sm text-destructive">Couldn&apos;t load questions.</p>
      ) : isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : conversations.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400 dark:text-neutral-500">Nothing here.</p>
      ) : (
        <>
          {sentToSupport.length > 0 && (
            <>
              <SectionHeader
                title={`Sent to support (${sentToSupport.length})`}
                detail="The customer pressed Send this conversation to support, so they're waiting on a reply. Newest first."
              />
              {sentToSupport.map((c) => (
                <ConversationBlock key={c.key} conversation={c} />
              ))}
            </>
          )}
          {others.length > 0 && (
            <>
              <SectionHeader
                title={`Not sent to support (${others.length})`}
                detail="The assistant logged these itself. Newest first."
              />
              {others.map((c) => (
                <ConversationBlock key={c.key} conversation={c} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
