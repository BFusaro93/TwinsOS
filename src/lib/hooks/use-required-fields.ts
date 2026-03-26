import { useSettingsStore } from "@/stores/settings-store";
import type { FieldRequirement } from "@/stores/settings-store";

/**
 * Returns helpers for reading field-level requirements (required / optional / hidden)
 * for a given entity, as configured in Settings → Required Fields.
 *
 * @param entity  One of: "purchase_order" | "requisition" | "work_order" | "asset" | "vehicle"
 */
export function useRequiredFields(entity: string) {
  const { requiredFields } = useSettingsStore();
  const fields = requiredFields[entity] ?? [];

  function getRequirement(field: string): FieldRequirement {
    return fields.find((f) => f.field === field)?.requirement ?? "optional";
  }

  /** True when the field must be filled before saving */
  function isRequired(field: string): boolean {
    return getRequirement(field) === "required";
  }

  /** True when the field should not be rendered at all */
  function isHidden(field: string): boolean {
    return getRequirement(field) === "hidden";
  }

  /** True when the field should be shown (required or optional) */
  function isVisible(field: string): boolean {
    return getRequirement(field) !== "hidden";
  }

  /**
   * Returns " *" if the field is required, "" otherwise.
   * Append to a label string: `Notes{req("notes")}`
   */
  function req(field: string): string {
    return isRequired(field) ? " *" : "";
  }

  /**
   * Returns true if all "required" fields in the given values map are filled.
   * values: Record<fieldKey, value> — pass the current field values.
   */
  function allRequiredFilled(values: Record<string, string | null | undefined>): boolean {
    return fields
      .filter((f) => f.requirement === "required")
      .every((f) => {
        const v = values[f.field];
        return v != null && String(v).trim() !== "" && v !== "none";
      });
  }

  return { getRequirement, isRequired, isHidden, isVisible, req, allRequiredFilled };
}
