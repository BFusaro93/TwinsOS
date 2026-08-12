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
import { useOrgTags } from "@/lib/hooks/use-clients";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import {
  CONDITION_GROUPS,
  CONDITION_OPERATORS,
  TAG_CONDITION_FIELDS,
  SERVICE_CONDITION_FIELDS,
} from "@/lib/automations/condition-fields";
import type { ConditionField, ConditionOperator } from "@/types/crm-automations";

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

          {c.operator !== "is_set" && c.operator !== "is_not_set" && (
            TAG_CONDITION_FIELDS.has(c.field) ? (
              <Select value={c.value} onValueChange={(v) => updateCondition(i, { value: v })}>
                <SelectTrigger className="flex-1 min-w-0">
                  <SelectValue placeholder="Select a tag" />
                </SelectTrigger>
                <SelectContent>
                  {orgTags.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : SERVICE_CONDITION_FIELDS.has(c.field) ? (
              <Select value={c.value} onValueChange={(v) => updateCondition(i, { value: v })}>
                <SelectTrigger className="flex-1 min-w-0">
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  {(services ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="Value"
                className="flex-1 min-w-0"
                value={c.value}
                onChange={(e) => updateCondition(i, { value: e.target.value })}
              />
            )
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
