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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useSequences, useUpdateSequence } from "@/lib/hooks/use-crm-automations";
import { createClient } from "@/lib/supabase/client";
import type { TriggerType, ConditionField, ConditionOperator, TriggerConfig } from "@/types/crm-automations";

// Trigger types that fire off a day-count gap rather than an event — the
// builder shows a "days" input for these instead of just the type selector.
const DATE_GAP_TRIGGER_TYPES = new Set<TriggerType>(["estimate_expiring", "estimate_no_response"]);

// ── Trigger groups ─────────────────────────────────────────────────────────────

const TRIGGER_GROUPS: { label: string; items: { value: TriggerType; label: string }[] }[] = [
  {
    label: "Client / Lead",
    items: [
      { value: "client_created", label: "Client was created" },
      { value: "client_cancelled", label: "Client cancelled" },
      { value: "client_reactivated", label: "Client was reactivated" },
      { value: "client_source_updated", label: "Client source updated" },
      { value: "lead_created", label: "Lead was created" },
      { value: "lead_cancelled", label: "Lead cancelled" },
      { value: "lead_converted_to_client", label: "Lead was converted to client" },
      { value: "contract_about_to_expire", label: "Contract is about to expire" },
      { value: "credit_card_charge_failed", label: "Credit card charge failed" },
      { value: "credit_card_about_to_expire", label: "Credit card is about to expire" },
      { value: "credit_card_updated", label: "Credit card was updated" },
      { value: "has_opted_in_emails", label: "Has opted in for emails" },
    ],
  },
  {
    label: "Date",
    items: [
      { value: "run_on_client_since_date", label: "Run on client since date" },
      { value: "run_on_custom_field_date", label: "Run on custom field date" },
      { value: "run_on_date", label: "Run on date" },
      { value: "run_on_day_of_week", label: "Run on day of week" },
      { value: "run_on_time_range", label: "Run on time range" },
    ],
  },
  {
    label: "Estimate",
    items: [
      { value: "estimate_created", label: "Estimate was created" },
      { value: "estimate_sent", label: "Estimate was sent" },
      { value: "estimate_won", label: "Estimate was won" },
      { value: "estimate_lost", label: "Estimate was lost" },
      { value: "estimate_expiring", label: "Estimate is expiring" },
      { value: "estimate_no_response", label: "No response from client" },
    ],
  },
  {
    label: "Form",
    items: [{ value: "form_submitted", label: "Form was submitted" }],
  },
  {
    label: "Invoice",
    items: [
      { value: "invoice_past_due", label: "Invoice past due" },
      { value: "invoice_created", label: "Invoice was created" },
      { value: "invoice_paid", label: "Invoice was paid" },
    ],
  },
  {
    label: "Job",
    items: [
      { value: "job_created", label: "Job was created" },
      { value: "job_cancelled", label: "Job was cancelled" },
      { value: "package_created", label: "Package was created" },
      { value: "visit_completed", label: "Visit was completed" },
      { value: "visit_cancelled", label: "Visit was cancelled" },
      { value: "visit_dispatched", label: "Visit was dispatched" },
      { value: "visit_skipped", label: "Visit was skipped" },
      { value: "visit_date_changed", label: "Visit date changed" },
      { value: "visit_moved_to_waiting_list", label: "Visit moved to waiting list" },
    ],
  },
  {
    label: "Tag",
    items: [
      { value: "tag_added", label: "Tag was added" },
      { value: "tag_removed", label: "Tag was removed" },
    ],
  },
  {
    label: "Ticket",
    items: [
      { value: "ticket_created", label: "Ticket was created" },
      { value: "ticket_closed", label: "Ticket was closed" },
      { value: "ticket_past_due", label: "Ticket past due" },
      { value: "ticket_reopened", label: "Ticket was reopened" },
      { value: "calendar_event_completed", label: "Calendar event completed" },
      { value: "calendar_event_created", label: "Calendar event created" },
      { value: "calendar_event_dispatched", label: "Calendar event dispatched" },
      { value: "calendar_event_skipped", label: "Calendar event skipped" },
    ],
  },
];

// ── Condition groups ───────────────────────────────────────────────────────────

const CONDITION_GROUPS: { label: string; items: { value: ConditionField; label: string }[] }[] = [
  {
    label: "Client / Lead",
    items: [
      { value: "account_balance", label: "Account balance" },
      { value: "account_type", label: "Account type" },
      { value: "billing_term", label: "Billing term" },
      { value: "cancellation_reason", label: "Cancellation reason" },
      { value: "client_lead_status", label: "Client/Lead status" },
      { value: "client_since_date", label: "Client since date" },
      { value: "client_source", label: "Client source" },
      { value: "csr", label: "CSR" },
      { value: "custom_field", label: "Custom field" },
      { value: "does_not_have_ach", label: "Does not have ACH on file" },
      { value: "does_not_have_credit_card", label: "Does not have credit card on file" },
      { value: "has_ach", label: "Has ACH on file" },
      { value: "has_credit_card", label: "Has credit card on file" },
      { value: "is_opted_in_emails", label: "Is opted in for emails" },
      { value: "map_code", label: "Map code" },
      { value: "opt_in_texts", label: "Opt-in texts" },
      { value: "payment_method_type", label: "Payment method type" },
      { value: "sales_person", label: "Sales person" },
      { value: "service_zip_code", label: "Service zip code" },
    ],
  },
  {
    label: "Date",
    items: [{ value: "date_of_year_between", label: "Date of year between" }],
  },
  {
    label: "Estimate",
    items: [
      { value: "estimate_has_product", label: "Estimate has product" },
      { value: "estimate_has_service", label: "Estimate has service" },
      { value: "estimate_sales_rep", label: "Estimate sales rep" },
      { value: "estimate_stage", label: "Estimate stage" },
      { value: "estimate_status", label: "Estimate status" },
      { value: "estimate_total", label: "Estimate total" },
    ],
  },
  {
    label: "Form",
    items: [{ value: "has_completed_form", label: "Has completed form" }],
  },
  {
    label: "Invoice",
    items: [
      { value: "invoice_has_product", label: "Invoice has product" },
      { value: "invoice_has_service", label: "Invoice has service" },
      { value: "invoice_past_due_days", label: "Invoice past due (days)" },
      { value: "invoice_was_paid_days", label: "Invoice was paid (days)" },
    ],
  },
  {
    label: "Job",
    items: [
      { value: "client_currently_has_package", label: "Client currently has package scheduled" },
      { value: "client_currently_has_recurring_job", label: "Client currently has recurring job" },
      { value: "client_does_not_have_package", label: "Client does not have package scheduled" },
      { value: "client_does_not_have_recurring_job", label: "Client does not have recurring job" },
      { value: "client_has_ever_had_package", label: "Client has ever had package" },
      { value: "client_has_ever_had_recurring_job", label: "Client has ever had recurring job" },
      { value: "client_has_not_ever_had_package", label: "Client has not ever had package" },
      { value: "client_has_not_ever_had_recurring_job", label: "Client has not ever had recurring job" },
      { value: "last_visit_date", label: "Last visit date" },
      { value: "visit_requires_call_ahead", label: "Visit requires call ahead" },
    ],
  },
  {
    label: "Tag",
    items: [
      { value: "does_not_have_tag", label: "Does not have tag" },
      { value: "has_tag", label: "Has tag" },
    ],
  },
  {
    label: "Ticket",
    items: [
      { value: "calendar_event_category", label: "Calendar event category" },
      { value: "ticket_category", label: "Ticket category" },
      { value: "ticket_past_due_days", label: "Ticket past due (days)" },
    ],
  },
];

const CONDITION_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "greater_than_or_equal", label: "greater than or equal to" },
  { value: "less_than_or_equal", label: "less than or equal to" },
  { value: "before", label: "before" },
  { value: "after", label: "after" },
  { value: "within_days", label: "within (days)" },
  { value: "is_set", label: "is set" },
  { value: "is_not_set", label: "is not set" },
];

const RESTRICT_ENTRY_OPTIONS = [
  { value: "all", label: "All clients and open leads" },
  { value: "active_clients", label: "Active clients only" },
  { value: "residential", label: "Residential clients only" },
  { value: "commercial", label: "Commercial clients only" },
  { value: "leads", label: "Leads only" },
  { value: "former_clients", label: "Former clients only" },
];

// ── Local state types ──────────────────────────────────────────────────────────

interface LocalTrigger {
  _key: string;
  triggerType: TriggerType;
  config: TriggerConfig;
}

interface LocalStopCondition {
  _key: string;
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
}

let _keyCounter = 0;
function nextKey() { return `k${++_keyCounter}`; }

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sequenceId: string;
  automationId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return createClient() as unknown as any; }

export function SequenceRulesDialog({ open, onOpenChange, sequenceId, automationId }: Props) {
  const { data: sequences } = useSequences(automationId);
  const sequence = sequences?.find((s) => s.id === sequenceId);
  const updateSequence = useUpdateSequence();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [restrictEntryTo, setRestrictEntryTo] = useState("all");
  const [allowReentry, setAllowReentry] = useState(false);
  const [reentryDays, setReentryDays] = useState(1);
  const [saving, setSaving] = useState(false);

  const [triggers, setTriggers] = useState<LocalTrigger[]>([]);
  const [stopConditions, setStopConditions] = useState<LocalStopCondition[]>([]);

  // Load sequence settings
  useEffect(() => {
    if (sequence) {
      setName(sequence.name);
      setDescription(sequence.description ?? "");
      setRestrictEntryTo(sequence.restrictEntryTo ?? "all");
      setAllowReentry(sequence.allowReentry);
      setReentryDays(Math.max(1, Math.round(sequence.reentryAfterMinutes / 1440)));
    }
  }, [sequence]);

  // Load triggers and stop conditions from DB on open
  useEffect(() => {
    if (!open || !sequenceId) return;
    const supabase = db();
    supabase
      .from("crm_sequence_triggers")
      .select("*")
      .eq("sequence_id", sequenceId)
      .order("position")
      .then(({ data }: { data: { trigger_type: string; config: TriggerConfig | null }[] | null }) => {
        setTriggers(
          (data ?? []).map((row) => ({
            _key: nextKey(),
            triggerType: row.trigger_type as TriggerType,
            config: row.config ?? {},
          }))
        );
      });
    supabase
      .from("crm_sequence_stop_conditions")
      .select("*")
      .eq("sequence_id", sequenceId)
      .order("created_at")
      .then(({ data }: { data: { field: string; operator: string; value: string | null }[] | null }) => {
        setStopConditions(
          (data ?? []).map((row) => ({
            _key: nextKey(),
            field: row.field as ConditionField,
            operator: row.operator as ConditionOperator,
            value: row.value ?? "",
          }))
        );
      });
  }, [open, sequenceId]);

  // ── Trigger handlers ─────────────────────────────────────────────────────────

  function addTrigger() {
    setTriggers((prev) => [...prev, { _key: nextKey(), triggerType: "visit_completed", config: {} }]);
  }

  function removeTrigger(key: string) {
    setTriggers((prev) => prev.filter((t) => t._key !== key));
  }

  function updateTriggerType(key: string, type: TriggerType) {
    setTriggers((prev) => prev.map((t) => t._key === key ? { ...t, triggerType: type, config: {} } : t));
  }

  function updateTriggerConfig(key: string, patch: TriggerConfig) {
    setTriggers((prev) => prev.map((t) => t._key === key ? { ...t, config: { ...t.config, ...patch } } : t));
  }

  // ── Stop condition handlers ───────────────────────────────────────────────────

  function addStopCondition() {
    setStopConditions((prev) => [
      ...prev,
      { _key: nextKey(), field: "client_lead_status", operator: "equals", value: "" },
    ]);
  }

  function removeStopCondition(key: string) {
    setStopConditions((prev) => prev.filter((sc) => sc._key !== key));
  }

  function updateStopCondition(key: string, patch: Partial<Omit<LocalStopCondition, "_key">>) {
    setStopConditions((prev) => prev.map((sc) => sc._key === key ? { ...sc, ...patch } : sc));
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const supabase = db();

      // Update sequence metadata
      await updateSequence.mutateAsync({
        id: sequenceId,
        automationId,
        updates: {
          name: name.trim(),
          description: description.trim() || undefined,
          restrictEntryTo,
          allowReentry,
          reentryAfterMinutes: reentryDays * 1440,
        },
      });

      // Replace triggers: delete existing, re-insert
      await supabase.from("crm_sequence_triggers").delete().eq("sequence_id", sequenceId);
      if (triggers.length > 0) {
        await supabase.from("crm_sequence_triggers").insert(
          triggers.map((t, i) => ({
            sequence_id: sequenceId,
            trigger_type: t.triggerType,
            position: i,
            config: t.config,
          }))
        );
      }

      // Replace stop conditions: delete existing, re-insert
      await supabase.from("crm_sequence_stop_conditions").delete().eq("sequence_id", sequenceId);
      if (stopConditions.length > 0) {
        await supabase.from("crm_sequence_stop_conditions").insert(
          stopConditions.map((sc) => ({
            sequence_id: sequenceId,
            field: sc.field,
            operator: sc.operator,
            value: sc.value || null,
          }))
        );
      }

      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sequence Rules</DialogTitle>
        </DialogHeader>

        {/* Sequence information */}
        <div className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Sequence Information
          </p>

          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Restrict Entry To</Label>
            <Select value={restrictEntryTo} onValueChange={setRestrictEntryTo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESTRICT_ENTRY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={allowReentry} onCheckedChange={setAllowReentry} id="reentry" />
            <Label htmlFor="reentry" className="cursor-pointer">
              Allow Re-Entry
            </Label>
          </div>

          {allowReentry && (
            <div className="flex items-center gap-2">
              <Label className="shrink-0">Re-enter after</Label>
              <Input
                type="number"
                className="w-24"
                min={1}
                value={reentryDays}
                onChange={(e) => setReentryDays(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <span className="text-sm text-slate-500">day(s)</span>
            </div>
          )}
        </div>

        <Separator className="my-2" />

        {/* Start triggers */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Start Triggers
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Sequence starts when ANY trigger fires.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addTrigger}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Trigger
            </Button>
          </div>

          {triggers.length === 0 && (
            <p className="text-sm text-slate-400 italic">No triggers configured — sequence will not start automatically.</p>
          )}

          {triggers.map((t) => (
            <div key={t._key} className="flex items-center gap-2">
              <Select value={t.triggerType} onValueChange={(v) => updateTriggerType(t._key, v as TriggerType)}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {TRIGGER_GROUPS.map((group) => (
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
              {DATE_GAP_TRIGGER_TYPES.has(t.triggerType) && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    value={t.config.days ?? ""}
                    onChange={(e) => updateTriggerConfig(t._key, { days: Number(e.target.value) || undefined })}
                    placeholder="7"
                    className="h-9 w-16 text-sm"
                  />
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {t.triggerType === "estimate_expiring" ? "days before expiry" : "days since sent"}
                  </span>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-red-400 hover:text-red-600"
                onClick={() => removeTrigger(t._key)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <Separator className="my-2" />

        {/* Stop conditions */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Stop Conditions
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Sequence stops before the next event when any condition is met.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addStopCondition}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Condition
            </Button>
          </div>

          {stopConditions.length === 0 && (
            <p className="text-sm text-slate-400 italic">No stop conditions — sequence runs to completion.</p>
          )}

          {stopConditions.map((sc) => (
            <div key={sc._key} className="flex items-start gap-2">
              <Select value={sc.field} onValueChange={(v) => updateStopCondition(sc._key, { field: v as ConditionField })}>
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

              <Select value={sc.operator} onValueChange={(v) => updateStopCondition(sc._key, { operator: v as ConditionOperator })}>
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

              {sc.operator !== "is_set" && sc.operator !== "is_not_set" && (
                <Input
                  placeholder="Value"
                  className="flex-1 min-w-0"
                  value={sc.value}
                  onChange={(e) => updateStopCondition(sc._key, { value: e.target.value })}
                />
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-red-400 hover:text-red-600"
                onClick={() => removeStopCondition(sc._key)}
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
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? "Saving…" : "Save Sequence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
