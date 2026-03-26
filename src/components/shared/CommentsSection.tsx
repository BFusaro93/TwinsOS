"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { formatDate, getInitials, getAvatarColor } from "@/lib/utils";
import { useComments } from "@/lib/hooks/use-comments";
import { Button } from "@/components/ui/button";
import type { CommentRecordType } from "@/types";

interface CommentsSectionProps {
  recordType: CommentRecordType;
  recordId: string;
}

export function CommentsSection({ recordType, recordId }: CommentsSectionProps) {
  const { data: comments, isLoading } = useComments(recordType, recordId);
  const [draft, setDraft] = useState("");

  return (
    <div className="flex flex-col gap-4">
      {/* Comment list */}
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading comments…</p>
      ) : comments && comments.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {comments.map((comment) => {
            const initials = getInitials(comment.authorName);
            const color = getAvatarColor(comment.authorName);
            return (
              <li key={comment.id} className="flex gap-3">
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${color}`}
                >
                  {initials}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {comment.authorName}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDate(comment.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-700">{comment.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">No comments yet.</p>
      )}

      {/* New comment input */}
      <div className="flex gap-2 rounded-md border border-slate-200 bg-white p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          rows={2}
          className="flex-1 resize-none text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        <Button
          size="sm"
          disabled={!draft.trim()}
          onClick={() => setDraft("")}
          className="self-end"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
