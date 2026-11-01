// Form answers are stored keyed by field LABEL (crm_form_responses.data and the
// server-side submit logic both read formData[field.label]), so two input
// fields sharing a label silently overwrite each other's answer. Changing the
// key format would break existing responses and integrations, so instead we
// make duplicates impossible going forward.
//
// Legacy forms that ALREADY contain duplicates are grandfathered: a duplicate
// group is only reported when at least one member is new or has had its label
// edited since the last save. That way old forms keep saving/publishing, but
// the moment someone creates or relabels a field into a clash they are told.

const DISPLAY_ONLY_TYPES = new Set(["header", "paragraph", "divider"]);

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

export interface LabelCheckField {
  id?: string | null;
  label: string;
  fieldType: string;
}

/** Returns the (trimmed) display labels that clash, one entry per duplicate group. */
export function findDuplicateFieldLabels(
  fields: LabelCheckField[],
  /** field id -> label as currently saved; used to grandfather untouched legacy duplicates */
  savedLabelById?: Map<string, string>
): string[] {
  const groups = new Map<string, LabelCheckField[]>();
  for (const f of fields) {
    if (DISPLAY_ONLY_TYPES.has(f.fieldType)) continue;
    const key = normalizeLabel(f.label ?? "");
    if (!key) continue; // blank labels are caught by their own check
    const group = groups.get(key);
    if (group) group.push(f);
    else groups.set(key, [f]);
  }

  const duplicates: string[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const grandfathered =
      !!savedLabelById &&
      group.every((f) => {
        const saved = f.id ? savedLabelById.get(f.id) : undefined;
        return saved !== undefined && normalizeLabel(saved) === key;
      });
    if (!grandfathered) duplicates.push(group[0].label.trim());
  }
  return duplicates;
}

export function duplicateLabelMessage(labels: string[]): string {
  const quoted = labels.map((l) => `"${l}"`).join(", ");
  return `Field labels must be unique — ${quoted} ${labels.length > 1 ? "are each used" : "is used"} by more than one field. Answers are stored by label, so duplicates would overwrite each other. Rename one of them.`;
}
