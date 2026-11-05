import type { z } from "zod";

/**
 * zod 4's built-in messages read like "Too small: expected string to have >=1
 * characters" or "Invalid input: expected string, received undefined" (zod 3 said
 * "Required"). Routes return the first issue's message straight to the user, so a
 * missing field surfaced as that. A message the schema set itself is kept as is.
 */
const BUILT_IN_MESSAGE =
  /^(Invalid input|Invalid option|Invalid (string|number|date|UUID|GUID|email|URL|ISO|key|element|value|format|base64|hex|regex)\b|Too (small|big)|Expected |Unrecognized key|Number must|String must|Required$)/i;

function fieldLabel(path: readonly PropertyKey[]): string | null {
  const key = [...path].reverse().find((p): p is string => typeof p === "string");
  if (!key) return null;
  const words = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w === "id" ? "ID" : w === "url" ? "URL" : w));
  const label = words.join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** A readable message for one zod issue. */
export function issueMessage(issue: z.core.$ZodIssue): string {
  if (issue.message && !BUILT_IN_MESSAGE.test(issue.message)) return issue.message;
  const label = fieldLabel(issue.path) ?? "Input";
  switch (issue.code) {
    case "invalid_type":
      return /received (undefined|null)/i.test(issue.message ?? "")
        ? `${label} is required`
        : `${label} must be a ${issue.expected}`;
    case "too_small": {
      const min = Number(issue.minimum);
      if (issue.origin === "string") return min <= 1 ? `${label} is required` : `${label} must be at least ${plural(min, "character")}`;
      if (issue.origin === "array" || issue.origin === "set") return `${label} needs at least ${plural(min, "item")}`;
      return `${label} must be at least ${issue.minimum}`;
    }
    case "too_big": {
      const max = Number(issue.maximum);
      if (issue.origin === "string") return `${label} must be at most ${plural(max, "character")}`;
      if (issue.origin === "array" || issue.origin === "set") return `${label} can have at most ${plural(max, "item")}`;
      return `${label} must be at most ${issue.maximum}`;
    }
    case "invalid_format":
      return `${label} isn't a valid ${issue.format === "regex" ? "value" : issue.format}`;
    case "invalid_value":
      return `${label} must be one of: ${issue.values.map(String).join(", ")}`;
    case "unrecognized_keys":
      return `Unrecognized ${issue.keys.length === 1 ? "field" : "fields"}: ${issue.keys.join(", ")}`;
    default:
      return issue.message || `${label} is invalid`;
  }
}

/** The first issue's readable message, for a route's 400 response. */
export function firstIssueMessage(error: z.ZodError | null | undefined, fallback = "Invalid input"): string {
  const issue = error?.issues[0];
  return issue ? issueMessage(issue) : fallback;
}
