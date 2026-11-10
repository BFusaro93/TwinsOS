const RELOAD_KEY = "chunk-reload-at";
const RELOAD_WINDOW_MS = 30_000;

/** True when the error is a stale-deploy "Loading chunk N failed" failure. */
export function isChunkLoadError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  const text = `${e?.name ?? ""} ${e?.message ?? ""}`;
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    text,
  );
}

/**
 * After a deploy, tabs opened earlier reference chunk files that no longer
 * exist. A hard reload fetches the new build. Reloads at most once per
 * 30s so a genuinely broken chunk can't cause a reload loop.
 * Returns true when a reload was triggered.
 */
export function reloadOnceForChunkError(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(error)) return false;
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
