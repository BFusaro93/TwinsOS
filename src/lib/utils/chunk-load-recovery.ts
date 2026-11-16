import { queryClient } from "@/lib/query-client";

const RELOAD_KEY = "chunk-reload-at";
const RELOAD_WINDOW_MS = 30_000;

/**
 * A tab opened before a deploy asks webpack for a module id that only exists
 * in the old build, so webpack's require does `modules[id].call(...)` on
 * undefined. Chrome/Edge: "reading 'call'"; Safari: "evaluating 'e[o].call'".
 * Only when the throw comes from webpack's own runtime (the stack points into
 * webpack / the /_next/static bundles' require) — an ordinary app TypeError
 * that happens to read `.call` off undefined is a bug to report, not a reason
 * to silently reload the page and lose unsaved edits.
 */
function isStaleWebpackModuleError(text: string, stack: string): boolean {
  if (!/reading 'call'|evaluating '\w+\[\w+\]\.call'/.test(text)) return false;
  return /__webpack_require__|webpack-runtime|webpack[.-][\w.-]*\.js|\/_next\/static\/chunks\/webpack/.test(stack);
}

/** True when the error is a stale-deploy "Loading chunk N failed" failure. */
export function isChunkLoadError(error: unknown): boolean {
  const e = error as { name?: string; message?: string; stack?: string } | null;
  const text = `${e?.name ?? ""} ${e?.message ?? ""}`;
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    text,
  ) || isStaleWebpackModuleError(text, typeof e?.stack === "string" ? e.stack : "");
}

/**
 * Work a reload would throw away: offline, a chunk fetch fails exactly like a stale
 * deploy — but reloading lands on the browser's offline page and drops the crew's
 * queued taps (paused TanStack mutations live only in memory). Also any save still
 * in flight. Leave the page alone then; the next navigation after reconnecting
 * recovers the deploy normally.
 */
export function hasUnsavedWork(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  try {
    return queryClient
      .getMutationCache()
      .getAll()
      .some((m) => m.state.isPaused || m.state.status === "pending");
  } catch {
    return false;
  }
}

/**
 * After a deploy, tabs opened earlier reference chunk files that no longer
 * exist. A hard reload fetches the new build. Reloads at most once per
 * 30s so a genuinely broken chunk can't cause a reload loop. Never while
 * offline or with a save queued / in flight (hasUnsavedWork).
 * Returns true when a reload was triggered.
 */
export function reloadOnceForChunkError(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(error)) return false;
  if (hasUnsavedWork()) return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Window-level net for rejections/errors that never reach a React boundary. */
export function installChunkLoadRecovery(): () => void {
  const onRejection = (e: PromiseRejectionEvent) => void reloadOnceForChunkError(e.reason);
  const onError = (e: ErrorEvent) => void reloadOnceForChunkError(e.error);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("error", onError);
  return () => {
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("error", onError);
  };
}
