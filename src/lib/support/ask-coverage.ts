/**
 * Ask AI replies end with a machine-readable line saying how well the help
 * docs covered the question:
 *
 *   [[coverage: full]]     the context answered it
 *   [[coverage: partial]]  answered in part, or relied on inference
 *   [[coverage: none]]     the context did not cover it
 *
 * The line is for the question log (and the staff review tab), not the user,
 * so it is stripped from the stream before it reaches the browser.
 */

export type AskCoverage = "full" | "partial" | "none" | "unknown";

const MARKER_RE = /\s*\[\[\s*coverage\s*:\s*(full|partial|none)\s*\]\]\s*$/i;

/** Characters held back from the live stream so a marker is never half-sent. */
export const COVERAGE_HOLDBACK = 40;

export function splitCoverage(full: string): { text: string; coverage: AskCoverage } {
  const match = MARKER_RE.exec(full);
  if (!match) return { text: full.trimEnd(), coverage: "unknown" };
  return {
    text: full.slice(0, match.index).trimEnd(),
    coverage: match[1].toLowerCase() as Exclude<AskCoverage, "unknown">,
  };
}

/**
 * Wraps a text stream so every chunk but the last COVERAGE_HOLDBACK
 * characters is forwarded immediately and the held-back tail is flushed (with
 * the marker removed) when the model finishes.
 */
export function createCoverageStripper(send: (text: string) => void) {
  let full = "";
  let sent = 0;
  return {
    push(chunk: string) {
      full += chunk;
      const safeUpTo = full.length - COVERAGE_HOLDBACK;
      if (safeUpTo > sent) {
        send(full.slice(sent, safeUpTo));
        sent = safeUpTo;
      }
    },
    /** Flushes the tail and returns the final text (marker removed) and coverage. */
    finish(): { text: string; coverage: AskCoverage } {
      const { text, coverage } = splitCoverage(full);
      if (text.length > sent) send(text.slice(sent));
      return { text, coverage };
    },
  };
}
