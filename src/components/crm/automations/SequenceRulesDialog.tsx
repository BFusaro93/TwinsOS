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
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ConditionListEditor, type ConditionRow } from "./ConditionListEditor";
import type { TriggerType, TriggerConfig } from "@/types/crm-automations";

// Trigger types that fire off a day-count gap rather than an event — the
// builder shows a "days" input for these instead of just the type selector.
const DATE_GAP_TRIGGER_TYPES = new Set<TriggerType>(["estimate_expiring", "estimate_no_response"]);

// Trigger types that fire for one specific service rather than the whole
// job/visit — the builder shows a service picker (or "Any service") for these.
const SERVICE_TRIGGER_TYPES = new Set<TriggerType>(["service_visit_completed"]);

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
      { value: "service_visit_completed", label: "Visit completed for service" },
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
  /** Extra AND-conditions gating this specific trigger (crm_sequence_trigger_conditions). */
  conditions: ConditionRow[];
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
  const { data: services } = useCRMServices();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [restrictEntryTo, setRestrictEntryTo] = useState("all");
  const [allowReentry, setAllowReentry] = useState(false);
  const [reentryDays, setReentryDays] = useState(1);
  const [saving, setSaving] = useState(false);

  const [triggers, setTriggers] = useState<LocalTrigger[]>([]);
  const [stopConditions, setStopConditions] = useState<ConditionRow[]>([]);

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

  // Load triggers (+ their per-trigger conditions) and stop conditions from DB on open
  useEffect(() => {
    if (!open || !sequenceId) return;
    const supabase = db();

    (async () => {
      const { data: triggerRows } = await supabase
        .from("crm_sequence_triggers")
        .select("id, trigger_type, config")
        .eq("sequence_id", sequenceId)
        .order("position");

      const rows = (triggerRows ?? []) as { id: string; trigger_type: string; config: TriggerConfig | null }[];
      const triggerIds = rows.map((r) => r.id);

      const conditionsByTrigger = new Map<string, ConditionRow[]>();
      if (triggerIds.length > 0) {
        const { data: condRows } = await supabase
          .from("crm_sequence_trigger_conditions")
          .select("trigger_id, field, operator, value")
          .in("trigger_id", triggerIds);
        (condRows ?? []).forEach((c: { trigger_id: string; field: string; operator: string; value: string | null }) => {
          const list = conditionsByTrigger.get(c.trigger_id) ?? [];
          list.push({ field: c.field as ConditionRow["field"], operator: c.operator as ConditionRow["operator"], value: c.value ?? "" });
          conditionsByTrigger.set(c.trigger_id, list);
        });
      }

      setTriggers(
        rows.map((row) => ({
          _key: nextKey(),
          triggerType: row.trigger_type as TriggerType,
          config: row.config ?? {},
          conditions: conditionsByTrigger.get(row.id) ?? [],
        }))
      );
    })();

    supabase
      .from("crm_sequence_stop_conditions")
      .select("*")
      .eq("sequence_id", sequenceId)
      .order("created_at")
      .then(({ data }: { data: { field: string; operator: string; value: string | null }[] | null }) => {
        setStopConditions(
          (data ?? []).map((row) => ({
            field: row.field as ConditionRow["field"],
            operator: row.operator as ConditionRow["operator"],
            value: row.value ?? "",
          }))
        );
      });
  }, [open, sequenceId]);

  // ── Trigger handlers ─────────────────────────────────────────────────────────

  function addTrigger() {
    setTriggers((prev) => [...prev, { _key: nextKey(), triggerType: "visit_completed", config: {}, conditions: [] }]);
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

  function updateTriggerConditions(key: string, rows: ConditionRow[]) {
    setTriggers((prev) => prev.map((t) => t._key === key ? { ...t, conditions: rows } : t));
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

      // Replace triggers: delete existing (cascades their conditions too),
      // re-insert, then re-insert each new trigger's conditions against its
      // freshly-generated id. Each call's {error} is checked explicitly —
      // Supabase doesn't throw on a failed query, so an insert failing after
      // the delete already succeeded would otherwise close this dialog having
      // silently wiped the sequence's triggers.
      const { error: delTriggersErr } = await supabase.from("crm_sequence_triggers").delete().eq("sequence_id", sequenceId);
      if (delTriggersErr) throw delTriggersErr;
      if (triggers.length > 0) {
        const { data: insertedTriggers, error: insTriggersErr } = await supabase
          .from("crm_sequence_triggers")
          .insert(
            triggers.map((t, i) => ({
              sequence_id: sequenceId,
              trigger_type: t.triggerType,
              position: i,
              config: t.config,
            }))
          )
          .select("id, position");
        if (insTriggersErr) throw insTriggersErr;

        const conditionRows = ((insertedTriggers ?? []) as { id: string; position: number }[]).flatMap((row) => {
          const t = triggers[row.position];
          return (t?.conditions ?? []).map((c) => ({
            trigger_id: row.id,
            condition_group: 0,
            field: c.field,
            operator: c.operator,
            value: c.value || null,
          }));
        });
        if (conditionRows.length > 0) {
          const { error: insCondErr } = await supabase.from("crm_sequence_trigger_conditions").insert(conditionRows);
          if (insCondErr) throw insCondErr;
        }
      }

      // Replace stop conditions: delete existing, re-insert
      const { error: delStopErr } = await supabase.from("crm_sequence_stop_conditions").delete().eq("sequence_id", sequenceId);
      if (delStopErr) throw delStopErr;
      if (stopConditions.length > 0) {
        const { error: insStopErr } = await supabase.from("crm_sequence_stop_conditions").insert(
          stopConditions.map((sc) => ({
            sequence_id: sequenceId,
            field: sc.field,
            operator: sc.operator,
            value: sc.value || null,
          }))
        );
        if (insStopErr) throw insStopErr;
      }

      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save sequence rules");
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
                Sequence starts when ANY trigger fires (and its own conditions, if any, all match).
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
            <div key={t._key} className="rounded-md border border-slate-200 p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
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
                {SERVICE_TRIGGER_TYPES.has(t.triggerType) && (
                  <Select
                    value={t.config.service_id ?? "any"}
                    onValueChange={(v) => updateTriggerConfig(t._key, { service_id: v === "any" ? undefined : v })}
                  >
                    <SelectTrigger className="h-9 w-44 shrink-0 text-sm">
                      <SelectValue placeholder="Any service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any service</SelectItem>
                      {(services ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

              <div className="pl-2 border-l-2 border-slate-100 ml-1">
                <ConditionListEditor
                  conditions={t.conditions}
                  onChange={(rows) => updateTriggerConditions(t._key, rows)}
                  joinLabel="AND"
                  emptyLabel="No extra conditions — fires whenever this trigger occurs."
                  addLabel="Add Condition"
                />
              </div>
            </div>
          ))}
        </div>

        <Separator className="my-2" />

        {/* Stop conditions */}
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Stop Conditions
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Sequence stops before the next event when any condition is met.
            </p>
          </div>

          <ConditionListEditor
            conditions={stopConditions}
            onChange={setStopConditions}
            joinLabel="OR"
            emptyLabel="No stop conditions — sequence runs to completion."
            addLabel="Add Condition"
          />
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
