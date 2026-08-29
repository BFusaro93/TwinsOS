"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { formatDateTime, getInitials, getAvatarColor } from "@/lib/utils";
import { useComments, useAddComment } from "@/lib/hooks/use-comments";
import { useCurrentUserStore } from "@/stores";
import { Button } from "@/components/ui/button";
import { MentionTextarea } from "@/components/shared/MentionTextarea";
import { parseMentionSegments } from "@/lib/mentions";
import type { CommentRecordType } from "@/types";

function CommentBody({ body, dark }: { body: string; dark: boolean }) {
  const segments = parseMentionSegments(body);
  return (
    <p className={`mt-0.5 whitespace-pre-wrap text-sm ${dark ? "text-slate-300" : "text-slate-700"}`}>
      {segments.map((seg, i) =>
        seg.type === "mention" ? (
          <span
            key={i}
            className={`rounded px-1 font-medium ${dark ? "bg-brand-500/20 text-brand-300" : "bg-brand-50 text-brand-700"}`}
          >
            @{seg.content}
          </span>
        ) : (
          <span key={i}>{seg.content}</span>
        )
      )}
    </p>
  );
}

interface CommentsSectionProps {
  recordType: CommentRecordType;
  recordId: string;
  /** Dark variant — use inside dark-background panels like the photo lightbox */
  dark?: boolean;
}

export function CommentsSection({ recordType, recordId, dark = false }: CommentsSectionProps) {
  const { data: comments, isLoading } = useComments(recordType, recordId);
  const { mutate: addComment, isPending: sending } = useAddComment();
  const { currentUser } = useCurrentUserStore();
  const [draft, setDraft] = useState("");

  function handleSend() {
    const body = draft.trim();
    if (!body) return;
    addComment(
      {
        recordType,
        recordId,
        authorName: currentUser.name || "Unknown",
        body,
      },
      { onSuccess: () => setDraft("") },
    );
  }

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
                    <span className={`text-sm font-medium ${dark ? "text-slate-100" : "text-slate-900"}`}>
                      {comment.authorName}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDateTime(comment.createdAt)}
                    </span>
                  </div>
                  <CommentBody body={comment.body} dark={dark} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">No comments yet.</p>
      )}

      {/* New comment input */}
      <div className={`flex gap-2 rounded-md border p-2 ${dark ? "border-[#3a3a3a] bg-[#2a2a2a]" : "border-slate-200 bg-white"}`}>
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          placeholder="Add a comment… (@ to mention someone)"
          rows={2}
          dark={dark}
          className={`w-full resize-none bg-transparent text-sm placeholder:text-slate-500 focus:outline-none ${dark ? "text-white" : "text-slate-900 placeholder:text-slate-400"}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          size="sm"
          disabled={!draft.trim() || sending}
          onClick={handleSend}
          title="Send (Shift+Enter)"
          className="self-end"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
