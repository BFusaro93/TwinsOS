"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useUpdateEvent } from "@/lib/hooks/use-crm-automations";
import type { CRMSequenceEvent, ConditionField, ConditionOperator } from "@/types/crm-automations";

const CONDITION_FIELDS: { label: string; items: { value: ConditionField; label: string }[] }[] = [
  {
    label: "Client / Lead",
    items: [
      { value: "account_balance", label: "Account balance" },
      { value: "account_type", label: "Account type" },
      { value: "billing_term", label: "Billing term" },
      { value: "client_lead_status", label: "Client/Lead status" },
      { value: "client_since_date", label: "Client since date" },
      { value: "client_source", label: "Client source" },
      { value: "custom_field", label: "Custom field" },
      { value: "has_ach", label: "Has ACH on file" },
      { value: "has_credit_card", label: "Has credit card on file" },
      { value: "is_opted_in_emails", label: "Is opted in for emails" },
      { value: "sales_person", label: "Sales person" },
      { value: "service_zip_code", label: "Service zip code" },
    ],
  },
  {
    label: "Job",
    items: [
      { value: "client_currently_has_package", label: "Client currently has package" },
      { value: "client_currently_has_recurring_job", label: "Client currently has recurring job" },
      { value: "client_has_ever_had_package", label: "Client has ever had package" },
      { value: "client_has_ever_had_recurring_job", label: "Client has ever had recurring job" },
      { value: "last_visit_date", label: "Last visit date" },
    ],
  },
  {
    label: "Tag",
    items: [
      { value: "does_not_have_tag", label: "Does not have tag" },
      { value: "has_tag", label: "Has tag" },
    ],
  },
];

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "before", label: "before" },
  { value: "after", label: "after" },
  { value: "within_days", label: "within (days)" },
  { value: "is_set", label: "is set" },
  { value: "is_not_set", label: "is not set" },
];

interface LocalCondition {
  _key: string;
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
}

let _key = 0;
function nextKey() { return `k${++_key}`; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: CRMSequenceEvent;
}

export function IfBranchEventDialog({ open, onOpenChange, event }: Props) {
  const updateEvent = useUpdateEvent();
  const [conditions, setConditions] = useState<LocalCondition[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const saved = (event.config.conditions ?? []) as {
        field: ConditionField;
        operator: ConditionOperator;
        value: string;
      }[];
      setConditions(saved.map((c) => ({ _key: nextKey(), ...c })));
    }
  }, [open, event]);

  function addCondition() {
    setConditions((prev) => [
      ...prev,
      { _key: nextKey(), field: "client_lead_status", operator: "equals", value: "" },
    ]);
  }

  function removeCondition(key: string) {
    setConditions((prev) => prev.filter((c) => c._key !== key));
  }

  function update(key: string, patch: Partial<Omit<LocalCondition, "_key">>) {
    setConditions((prev) => prev.map((c) => c._key === key ? { ...c, ...patch } : c));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        sequenceId: event.sequenceId,
        config: {
          conditions: conditions.map(({ _key: _k, ...rest }) => rest),
        },
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit IF Branch</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-slate-500">
          Events nested under this IF block only run when ALL conditions below are met. If no conditions are met, clients skip the IF block and continue in the sequence.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label>Conditions</Label>
            <div className="flex items-center gap-2">
              {conditions.length > 1 && (
                <Badge variant="outline" className="text-[10px]">ALL must match (AND)</Badge>
              )}
              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Condition
              </Button>
            </div>
          </div>

          {conditions.length === 0 && (
            <p className="text-sm text-slate-400 italic">No conditions — all clients will follow this branch.</p>
          )}

          {conditions.map((c, i) => (
            <div key={c._key} className="flex items-start gap-2">
              {i > 0 && (
                <span className="mt-2 text-[10px] font-semibold text-slate-400 w-8 shrink-0 text-center">AND</span>
              )}
              {i === 0 && <div className="w-8 shrink-0" />}

              <Select value={c.field} onValueChange={(v) => update(c._key, { field: v as ConditionField })}>
                <SelectTrigger className="w-48 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {CONDITION_FIELDS.map((group) => (
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

              <Select value={c.operator} onValueChange={(v) => update(c._key, { operator: v as ConditionOperator })}>
                <SelectTrigger className="w-36 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {c.operator !== "is_set" && c.operator !== "is_not_set" && (
                <Input
                  placeholder="Value"
                  className="flex-1 min-w-0"
                  value={c.value}
                  onChange={(e) => update(c._key, { value: e.target.value })}
                />
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-red-400 hover:text-red-600"
                onClick={() => removeCondition(c._key)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
