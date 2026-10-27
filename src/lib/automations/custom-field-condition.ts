import { z } from "zod";
import type { ConditionOperator } from "@/types/crm-automations";

/**
 * "Custom field" automation conditions point at one of the org's client
 * custom field definitions (crm_custom_field_defs). The condition tables only
 * have field/operator/value columns, so the definition id and the comparison
 * value are packed into `value` as a small JSON object: {"d": "<def id>", "v": "<value>"}.
 * Legacy rows (plain text from before the picker existed) fail to decode and
 * evaluate as "not met" until the user picks a field.
 */
export interface CustomFieldConditionValue {
  /** crm_custom_field_defs.id */
  d: string;
  /** Comparison value (ignored by is_set / is_not_set). */
  v: string;
}

const customFieldValueSchema = z.object({
  d: z.string().uuid(),
  v: z.string(),
});

export function encodeCustomFieldCondition(defId: string, value: string): string {
  return JSON.stringify({ d: defId, v: value } satisfies CustomFieldConditionValue);
}

export function decodeCustomFieldCondition(raw: string | null | undefined): CustomFieldConditionValue | null {
  if (!raw) return null;
  try {
    const parsed = customFieldValueSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type CustomFieldType = "text" | "number";

export const CUSTOM_FIELD_OPERATORS: Record<CustomFieldType, ConditionOperator[]> = {
  text: ["equals", "not_equals", "contains", "not_contains", "is_set", "is_not_set"],
  number: [
    "equals",
    "not_equals",
    "greater_than",
    "less_than",
    "greater_than_or_equal",
    "less_than_or_equal",
    "is_set",
    "is_not_set",
  ],
};

/** The stored value row for one (client, definition) pair. */
export interface CustomFieldStoredValue {
  value_text: string | null;
  value_number: number | null;
}

/**
 * Reads a stored value as the definition's CURRENT type. A definition can be
 * switched text <-> number after values exist, leaving the value in the other
 * column, so fall back to the other column (parsed) before treating it as empty.
 */
export function readCustomFieldValue(type: CustomFieldType, stored: CustomFieldStoredValue | null): string | number | null {
  if (!stored) return null;
  if (type === "number") {
    if (typeof stored.value_number === "number") return stored.value_number;
    const parsed = stored.value_text?.trim() ? Number(stored.value_text) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (stored.value_text !== null && stored.value_text.trim() !== "") return stored.value_text;
  return typeof stored.value_number === "number" ? String(stored.value_number) : null;
}

/** Pure comparison. A missing value only satisfies is_not_set; everything else is "not met". */
export function compareCustomField(
  type: CustomFieldType,
  fieldValue: string | number | null,
  operator: ConditionOperator,
  condValue: string
): boolean {
  if (operator === "is_set") return fieldValue !== null;
  if (operator === "is_not_set") return fieldValue === null;
  if (fieldValue === null) return false;
  if (!CUSTOM_FIELD_OPERATORS[type].includes(operator)) return false;

  if (type === "number") {
    const n = Number(fieldValue);
    const c = condValue.trim() === "" ? NaN : Number(condValue);
    if (!Number.isFinite(n) || !Number.isFinite(c)) return false;
    switch (operator) {
      case "equals": return n === c;
      case "not_equals": return n !== c;
      case "greater_than": return n > c;
      case "less_than": return n < c;
      case "greater_than_or_equal": return n >= c;
      case "less_than_or_equal": return n <= c;
      default: return false;
    }
  }

  const fv = String(fieldValue).trim().toLowerCase();
  const cv = condValue.trim().toLowerCase();
  switch (operator) {
    case "equals": return fv === cv;
    case "not_equals": return fv !== cv;
    case "contains": return fv.includes(cv);
    case "not_contains": return !fv.includes(cv);
    default: return false;
  }
}

const OPERATORS = [
  "equals", "not_equals", "contains", "not_contains", "greater_than", "less_than",
  "greater_than_or_equal", "less_than_or_equal", "before", "after", "within_days", "is_set", "is_not_set",
] as const;

/**
 * Save-time validation for condition rows (trigger, stop, If branch). Only the
 * custom_field rows carry extra structure; everything else keeps the loose
 * shape it always had so existing conditions behave exactly as before.
 */
export const conditionRowSchema = z
  .object({
    field: z.string().min(1),
    operator: z.enum(OPERATORS),
    value: z.string().nullable().optional(),
  })
  .superRefine((row, ctx) => {
    if (row.field !== "custom_field") return;
    const decoded = decodeCustomFieldCondition(row.value);
    if (!decoded) {
      ctx.addIssue({ code: "custom", message: "Pick a custom field for the Custom field condition." });
      return;
    }
    const needsValue = row.operator !== "is_set" && row.operator !== "is_not_set";
    if (needsValue && decoded.v.trim() === "") {
      ctx.addIssue({ code: "custom", message: "Enter a value for the Custom field condition." });
    }
  });

/** Returns the first validation message, or null when every row is valid. */
export function validateConditionRows(rows: { field: string; operator: string; value: string | null | undefined }[]): string | null {
  for (const row of rows) {
    const res = conditionRowSchema.safeParse(row);
    if (!res.success) return res.error.issues[0]?.message ?? "Invalid condition.";
  }
  return null;
}
