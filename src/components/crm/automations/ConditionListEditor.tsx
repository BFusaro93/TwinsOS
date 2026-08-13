"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MultiSelectDropdown } from "@/components/shared/MultiSelectDropdown";
import { useOrgTags } from "@/lib/hooks/use-clients";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { useSelectableEmployees } from "@/lib/hooks/use-employees";
import { useProducts } from "@/lib/hooks/use-products";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import { useForms } from "@/lib/hooks/use-crm-forms";
import { usePackages } from "@/lib/hooks/use-packages";
import { useEstimateStages } from "@/lib/hooks/use-estimate-stages";
import {
  CONDITION_GROUPS,
  CONDITION_OPERATORS,
  TAG_CONDITION_FIELDS,
  SERVICE_CONDITION_FIELDS,
  PRODUCT_CONDITION_FIELDS,
  TICKET_CATEGORY_CONDITION_FIELDS,
  FORM_CONDITION_FIELDS,
  PACKAGE_CONDITION_FIELDS,
  CLIENT_SOURCE_CONDITION_FIELDS,
  CANCELLATION_REASON_CONDITION_FIELDS,
  ESTIMATE_STAGE_CONDITION_FIELDS,
  FIXED_MULTI_CONDITION_FIELDS,
  EMPLOYEE_CONDITION_FIELDS,
  BOOLEAN_CONDITION_FIELDS,
} from "@/lib/automations/condition-fields";
import type { ConditionField, ConditionOperator } from "@/types/crm-automations";
import type { MultiSelectOption } from "@/components/shared/MultiSelectDropdown";

export interface ConditionRow {
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
}

interface Props {
  conditions: ConditionRow[];
  onChange: (rows: ConditionRow[]) => void;
  /** "AND" — every row must match (If Branch, Start Trigger conditions). "OR" — any row matches (Stop Conditions). */
  joinLabel: "AND" | "OR";
  emptyLabel?: string;
  addLabel?: string;
  defaultField?: ConditionField;
}

/**
 * Shared field/operator/value condition-row builder. Used by If Branch, Stop
 * Conditions, and Start Trigger conditions so all three offer the same
 * field catalog and the same tag-aware / service-aware value inputs instead
 * of three independently-drifting copies.
 */
export function ConditionListEditor({
  conditions,
  onChange,
  joinLabel,
  emptyLabel = "No conditions configured.",
  addLabel = "Add Condition",
  defaultField = "client_lead_status",
}: Props) {
  const orgTags = useOrgTags();
  const { data: services } = useCRMServices();
  const { data: employees } = useSelectableEmployees();
  const salesReps = (employees ?? []).filter((e) => e.isSalesRep && e.userId);
  const { data: products } = useProducts();
  const { data: ticketCategories } = useOrgList("ticket_categories");
  const { data: forms } = useForms();
  const { data: packages } = usePackages();
  const { data: clientSources } = useOrgList("client_sources");
  const { data: cancellationReasons } = useOrgList("cancellation_reasons");
  const { data: estimateStages } = useEstimateStages();

  /** Resolves the multi-select options + placeholder for a field, or null if it should render as a plain text Input. */
  function multiSelectConfigFor(field: ConditionField): { options: MultiSelectOption[]; placeholder: string } | null {
    if (TAG_CONDITION_FIELDS.has(field)) return { options: orgTags.map((t) => ({ value: t, label: t })), placeholder: "Select tag(s)" };
    if (SERVICE_CONDITION_FIELDS.has(field)) return { options: (services ?? []).map((s) => ({ value: s.name, label: s.name })), placeholder: "Select service(s)" };
    if (FIXED_MULTI_CONDITION_FIELDS[field]) return { options: FIXED_MULTI_CONDITION_FIELDS[field]!, placeholder: "Select value(s)" };
    if (EMPLOYEE_CONDITION_FIELDS.has(field)) return { options: salesReps.map((e) => ({ value: e.userId as string, label: `${e.firstName} ${e.lastName}` })), placeholder: "Select rep(s)" };
    if (PRODUCT_CONDITION_FIELDS.has(field)) return { options: (products ?? []).map((p) => ({ value: p.id, label: p.name })), placeholder: "Select product(s)" };
    if (TICKET_CATEGORY_CONDITION_FIELDS.has(field)) return { options: (ticketCategories ?? []).map((o) => ({ value: o.value, label: o.value })), placeholder: "Select categor(ies)" };
    if (FORM_CONDITION_FIELDS.has(field)) return { options: (forms ?? []).map((f) => ({ value: f.id, label: f.name })), placeholder: "Select form(s)" };
    if (PACKAGE_CONDITION_FIELDS.has(field)) return { options: (packages ?? []).map((p) => ({ value: p.id, label: p.name })), placeholder: "Select package(s)" };
    if (CLIENT_SOURCE_CONDITION_FIELDS.has(field)) return { options: (clientSources ?? []).map((o) => ({ value: o.value, label: o.value })), placeholder: "Select source(s)" };
    if (CANCELLATION_REASON_CONDITION_FIELDS.has(field)) return { options: (cancellationReasons ?? []).map((o) => ({ value: o.value, label: o.value })), placeholder: "Select reason(s)" };
    if (ESTIMATE_STAGE_CONDITION_FIELDS.has(field)) return { options: (estimateStages ?? []).map((s) => ({ value: s.stageKey, label: s.name })), placeholder: "Select stage(s)" };
    return null;
  }

  function addCondition() {
    onChange([...conditions, { field: defaultField, operator: "equals", value: "" }]);
  }
  function removeCondition(idx: number) {
    onChange(conditions.filter((_, i) => i !== idx));
  }
  function updateCondition(idx: number, patch: Partial<ConditionRow>) {
    onChange(conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        {conditions.length > 1 ? (
          <Badge variant="outline" className="text-[10px]">
            {joinLabel === "AND" ? "ALL must match (AND)" : "ANY match (OR)"}
          </Badge>
        ) : (
          <span />
        )}
        <Button variant="outline" size="sm" onClick={addCondition}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {addLabel}
        </Button>
      </div>

      {conditions.length === 0 && <p className="text-sm text-slate-400 italic">{emptyLabel}</p>}

      {conditions.map((c, i) => (
        <div key={i} className="flex items-start gap-2">
          {i > 0 && (
            <span className="mt-2 text-[10px] font-semibold text-slate-400 w-8 shrink-0 text-center">{joinLabel}</span>
          )}
          {i === 0 && <div className="w-8 shrink-0" />}

          <Select value={c.field} onValueChange={(v) => updateCondition(i, { field: v as ConditionField, value: "" })}>
            <SelectTrigger className="w-48 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {CONDITION_GROUPS.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          <Select value={c.operator} onValueChange={(v) => updateCondition(i, { operator: v as ConditionOperator })}>
            <SelectTrigger className="w-40 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_OPERATORS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {BOOLEAN_CONDITION_FIELDS.has(c.field) ? (
            <p className="flex-1 min-w-0 self-center text-xs text-slate-400 italic">No value needed — selecting this field is the whole condition.</p>
          ) : c.operator !== "is_set" && c.operator !== "is_not_set" && (
            (() => {
              const cfg = multiSelectConfigFor(c.field);
              return cfg ? (
                <MultiSelectDropdown
                  className="h-9 flex-1 min-w-0 justify-between text-sm font-normal"
                  options={cfg.options}
                  selected={c.value ? c.value.split(",").map((v) => v.trim()).filter(Boolean) : []}
                  onChange={(values) => updateCondition(i, { value: values.join(",") })}
                  placeholder={cfg.placeholder}
                />
              ) : (
                <Input
                  placeholder="Value"
                  className="flex-1 min-w-0"
                  value={c.value}
                  onChange={(e) => updateCondition(i, { value: e.target.value })}
                />
              );
            })()
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-red-400 hover:text-red-600"
            onClick={() => removeCondition(i)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
