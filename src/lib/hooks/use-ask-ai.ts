import { useCallback, useRef, useState } from "react";

export interface AskAIMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Streams a chat response from /api/support/ask. Kept as a plain hook
 * rather than a TanStack Query mutation — a streamed token-by-token reply
 * doesn't fit query/mutation cache semantics, and the message list here is
 * ephemeral, per-session UI state, not server data worth caching.
 */
export function useAskAI() {
  const [messages, setMessages] = useState<AskAIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (question: string) => {
      setError(null);
      const history = messages;
      setMessages((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/support/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({ error: "Ask AI request failed" }));
          throw new Error(body.error ?? "Ask AI request failed");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + chunk };
            return next;
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Ask AI request failed";
        setError(message);
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsStreaming(false);
  }, []);

  return { messages, ask, isStreaming, error, reset };
}
