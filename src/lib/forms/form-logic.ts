// Pure form logic shared by the public form page (src/app/forms/[slug]/page.tsx,
// which decides what the visitor sees) and the server-side submission check
// (submit-form-response.ts, which re-validates what was submitted). Keeping the
// page-walk and rule-condition semantics in ONE place means the two can never
// drift — a drift here shows up as a legitimate submission being rejected.

/** Same pattern the public page has always used for email-type fields. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ruleConditionMatches(value: string, operator: string, operand: string | null): boolean {
  const v = value ?? "";
  const op = operand ?? "";
  switch (operator) {
    case "equals":       return v === op;
    case "not_equals":   return v !== op;
    case "greater_than": return parseFloat(v) > parseFloat(op);
    case "less_than":    return parseFloat(v) < parseFloat(op);
    case "contains":     return v.toLowerCase().includes(op.toLowerCase());
    case "is_empty":     return v.trim() === "";
    case "is_not_empty": return v.trim() !== "";
    default:             return false;
  }
}

export interface PageWalkRule {
  sourceFieldId: string | null;
  operator: string;
  operand: string | null;
  action: string;
  actionValue: string | null;
}

/** Where "Next" lands from a page: the default advance, overridden by the LAST
 *  matching jump_to_page rule (rules are evaluated in order, later wins),
 *  clamped to [1, totalPages]. `getValue` returns the visitor's current answer
 *  for a field id as the string the rule operators compare against. */
export function resolveJumpTarget(
  defaultNextPage: number,
  totalPages: number,
  rules: PageWalkRule[],
  getValue: (fieldId: string) => string
): number {
  let targetPage = defaultNextPage;
  for (const rule of rules) {
    if (rule.action !== "jump_to_page" || !rule.sourceFieldId) continue;
    if (!ruleConditionMatches(getValue(rule.sourceFieldId), rule.operator, rule.operand)) continue;
    const p = parseInt(rule.actionValue ?? "", 10);
    if (p) targetPage = p;
  }
  return Math.min(Math.max(targetPage, 1), totalPages);
}

/** Replays the visitor's path from page 1 to the last page using the final
 *  answers. Returns the set of pages they must have passed through. If the
 *  jump rules loop (a target already visited) there is no forward path, so
 *  every page is returned — the strictest reading, same as before page-walking
 *  existed — rather than guessing which pages were skipped. */
export function computeVisitedPages(
  totalPages: number,
  rules: PageWalkRule[],
  getValue: (fieldId: string) => string
): Set<number> {
  const visited = new Set<number>([1]);
  let current = 1;
  while (current < totalPages) {
    const next = resolveJumpTarget(Math.min(current + 1, totalPages), totalPages, rules, getValue);
    if (visited.has(next)) {
      return new Set(Array.from({ length: totalPages }, (_, i) => i + 1));
    }
    visited.add(next);
    current = next;
  }
  return visited;
}
