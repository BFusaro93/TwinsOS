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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  useSequences,
  useUpdateSequence,
  useCreateTrigger,
  useDeleteTrigger,
  useCreateStopCondition,
  useDeleteStopCondition,
} from "@/lib/hooks/use-crm-automations";
import { createClient } from "@/lib/supabase/client";
import type { TriggerType, CRMSequenceTrigger, CRMStopCondition } from "@/types/crm-automations";

const TRIGGER_TYPES: { value: TriggerType; label: string }[] = [
  { value: "client_created", label: "Client created" },
  { value: "client_status_changed", label: "Client status changed" },
  { value: "job_completed", label: "Job completed" },
  { value: "job_created", label: "Job created" },
  { value: "estimate_sent", label: "Estimate sent" },
  { value: "invoice_sent", label: "Invoice sent" },
  { value: "invoice_paid", label: "Invoice paid" },
  { value: "contract_signed", label: "Contract signed" },
  { value: "date_based", label: "Date-based" },
  { value: "manual", label: "Manual" },
];

const CONDITION_FIELDS = [
  { value: "client_type", label: "Client type" },
  { value: "client_status", label: "Client status" },
  { value: "job_type", label: "Job type" },
  { value: "job_status", label: "Job status" },
  { value: "tag", label: "Tag" },
  { value: "property_city", label: "Property city" },
  { value: "revenue_ytd", label: "Revenue YTD" },
  { value: "last_job_date", label: "Last job date" },
];

const CONDITION_OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "is_set", label: "is set" },
  { value: "is_not_set", label: "is not set" },
];

const RESTRICT_ENTRY_OPTIONS = [
  { value: "all", label: "All clients" },
  { value: "residential", label: "Residential only" },
  { value: "commercial", label: "Commercial only" },
  { value: "active", label: "Active clients only" },
  { value: "lead", label: "Leads only" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sequenceId: string;
  automationId: string;
}

export function SequenceRulesDialog({ open, onOpenChange, sequenceId, automationId }: Props) {
  const { data: sequences } = useSequences(automationId);
  const sequence = sequences?.find((s) => s.id === sequenceId);
  const updateSequence = useUpdateSequence();
  const createTrigger = useCreateTrigger();
  const deleteTrigger = useDeleteTrigger();
  const createStop = useCreateStopCondition();
  const deleteStop = useDeleteStopCondition();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [restrictEntryTo, setRestrictEntryTo] = useState("all");
  const [allowReentry, setAllowReentry] = useState(false);
  const [reentryDays, setReentryDays] = useState(1);
  const [saving, setSaving] = useState(false);

  const [triggers, setTriggers] = useState<CRMSequenceTrigger[]>([]);
  const [stopConditions, setStopConditions] = useState<CRMStopCondition[]>([]);

  useEffect(() => {
    if (sequence) {
      setName(sequence.name);
      setDescription(sequence.description ?? "");
      setRestrictEntryTo(sequence.restrictEntryTo);
      setAllowReentry(sequence.allowReentry);
      setReentryDays(Math.round(sequence.reentryAfterMinutes / 1440));
    }
  }, [sequence]);

  useEffect(() => {
    if (!open || !sequenceId) return;
    const supabase = createClient();
    supabase
      .from("crm_sequence_triggers")
      .select("*")
      .eq("sequence_id", sequenceId)
      .order("position")
      .then(({ data }) => setTriggers((data ?? []) as CRMSequenceTrigger[]));
    supabase
      .from("crm_sequence_stop_conditions")
      .select("*")
      .eq("sequence_id", sequenceId)
      .order("created_at")
      .then(({ data }) => setStopConditions((data ?? []) as CRMStopCondition[]));
  }, [open, sequenceId]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
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
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddTrigger() {
    const t = await createTrigger.mutateAsync({ sequenceId, triggerType: "client_created" });
    setTriggers((prev) => [...prev, t]);
  }

  async function handleDeleteTrigger(id: string) {
    await deleteTrigger.mutateAsync({ id, sequenceId });
    setTriggers((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleAddStop() {
    const s = await createStop.mutateAsync({ sequenceId, field: "client_status", operator: "equals" });
    setStopConditions((prev) => [...prev, s]);
  }

  async function handleDeleteStop(id: string) {
    await deleteStop.mutateAsync({ id, sequenceId });
    setStopConditions((prev) => prev.filter((s) => s.id !== id));
  }

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
                onChange={(e) => setReentryDays(parseInt(e.target.value) || 1)}
              />
              <span className="text-sm text-slate-500">days</span>
            </div>
          )}
        </div>

        <Separator className="my-2" />

        {/* Start triggers */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Start Triggers
            </p>
            <Button variant="outline" size="sm" onClick={handleAddTrigger}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Trigger
            </Button>
          </div>
          {triggers.length === 0 && (
            <p className="text-sm text-slate-400">No triggers configured.</p>
          )}
          {triggers.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <Select
                value={t.triggerType}
                onValueChange={() => {}}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((tt) => (
                    <SelectItem key={tt.value} value={tt.value}>
                      {tt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-400 hover:text-red-600"
                onClick={() => handleDeleteTrigger(t.id)}
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
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Stop Conditions
            </p>
            <Button variant="outline" size="sm" onClick={handleAddStop}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Condition
            </Button>
          </div>
          {stopConditions.length === 0 && (
            <p className="text-sm text-slate-400">No stop conditions configured.</p>
          )}
          {stopConditions.map((sc) => (
            <div key={sc.id} className="flex items-center gap-2">
              <Select value={sc.field} onValueChange={() => {}}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sc.operator} onValueChange={() => {}}>
                <SelectTrigger className="w-36">
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
              <Input
                placeholder="Value"
                className="flex-1"
                defaultValue={sc.value ?? ""}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-400 hover:text-red-600"
                onClick={() => handleDeleteStop(sc.id)}
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
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
