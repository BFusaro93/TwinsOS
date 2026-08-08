"use client";

import React, { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  useEstimateStages,
  useUpsertEstimateStage,
  useDeleteEstimateStage,
  useSeedDefaultStages,
  type EstimateStage,
} from "@/lib/hooks/use-estimate-stages";

function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(0);
}

function percentToBps(pct: string): number {
  const n = parseFloat(pct);
  if (isNaN(n)) return 0;
  return Math.round(Math.min(100, Math.max(0, n)) * 100);
}

function StageRow({ stage }: { stage: EstimateStage }) {
  const { mutateAsync: upsert } = useUpsertEstimateStage();
  const { mutateAsync: remove } = useDeleteEstimateStage();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(stage.name);
  const [editingProb, setEditingProb] = useState(false);
  const [probDraft, setProbDraft] = useState(bpsToPercent(stage.probabilityBps));
  const [saving, setSaving] = useState(false);

  async function commitName() {
    setEditingName(false);
    if (!nameDraft.trim() || nameDraft.trim() === stage.name) return;
    setSaving(true);
    try {
      await upsert({ id: stage.id, name: nameDraft.trim() });
    } catch {
      toast.error("Failed to save stage name");
      setNameDraft(stage.name);
    } finally {
      setSaving(false);
    }
  }

  async function commitProb() {
    setEditingProb(false);
    const bps = percentToBps(probDraft);
    if (bps === stage.probabilityBps) return;
    setSaving(true);
    try {
      await upsert({ id: stage.id, probabilityBps: bps });
    } catch {
      toast.error("Failed to save probability");
      setProbDraft(bpsToPercent(stage.probabilityBps));
    } finally {
      setSaving(false);
    }
  }

  async function handleActiveToggle(checked: boolean) {
    setSaving(true);
    try {
      await upsert({ id: stage.id, active: checked });
    } catch {
      toast.error("Failed to update stage");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (stage.isSystem) return;
    if (!confirm(`Delete stage "${stage.name}"?`)) return;
    try {
      await remove(stage.id);
      toast.success("Stage deleted");
    } catch {
      toast.error("Failed to delete stage");
    }
  }

  return (
    <div className="flex items-center gap-4 py-3">
      <div className="flex-1 min-w-0">
        {editingName ? (
          <Input
            autoFocus
            className="h-7 w-44 text-sm"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitName();
              if (e.key === "Escape") { setEditingName(false); setNameDraft(stage.name); }
            }}
            disabled={saving}
          />
        ) : (
          <button
            className="text-left text-sm font-medium text-slate-800 hover:text-brand-600"
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {stage.name}
          </button>
        )}
      </div>

      <div className="w-24">
        {editingProb ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              className="h-7 w-16 text-sm"
              type="number"
              min="0"
              max="100"
              value={probDraft}
              onChange={(e) => setProbDraft(e.target.value)}
              onBlur={() => void commitProb()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitProb();
                if (e.key === "Escape") { setEditingProb(false); setProbDraft(bpsToPercent(stage.probabilityBps)); }
              }}
              disabled={saving}
            />
            <span className="text-xs text-slate-400">%</span>
          </div>
        ) : (
          <button
            className="text-sm text-slate-600 hover:text-brand-600"
            onClick={() => setEditingProb(true)}
            title="Click to edit probability"
          >
            {bpsToPercent(stage.probabilityBps)}%
          </button>
        )}
      </div>

      <div className="w-20 shrink-0">
        <Badge variant="outline" className="font-mono text-xs">
          {stage.stageKey}
        </Badge>
      </div>

      <div className="flex w-16 shrink-0 justify-start">
        <Checkbox
          checked={stage.active}
          onCheckedChange={(v) => void handleActiveToggle(!!v)}
          disabled={saving}
          title="Active"
        />
      </div>

      {stage.isSystem ? (
        <div className="w-7" title="System stages cannot be deleted">
          <span className="text-xs text-slate-300">—</span>
        </div>
      ) : (
        <button
          onClick={() => void handleDelete()}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
          title="Delete stage"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function AddStageForm() {
  const { mutateAsync: upsert } = useUpsertEstimateStage();
  const [name, setName] = useState("");
  const [stageKey, setStageKey] = useState("");
  const [prob, setProb] = useState("50");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!name.trim()) { toast.error("Stage name is required"); return; }
    if (!stageKey.trim()) { toast.error("Stage key is required"); return; }
    setSaving(true);
    try {
      await upsert({
        name: name.trim(),
        stageKey: stageKey.trim().toLowerCase().replace(/\s+/g, "_"),
        probabilityBps: percentToBps(prob),
        active: true,
        isSystem: false,
        isDefault: false,
      });
      toast.success("Stage added");
      setName("");
      setStageKey("");
      setProb("50");
    } catch {
      toast.error("Failed to add stage");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-end gap-2 pt-3 flex-wrap">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">Name</span>
        <Input
          className="h-8 w-40 text-sm"
          placeholder="e.g. Pending Review"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!stageKey) setStageKey(e.target.value.toLowerCase().replace(/\s+/g, "_"));
          }}
          onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">Key</span>
        <Input
          className="h-8 w-32 font-mono text-sm"
          placeholder="pending_review"
          value={stageKey}
          onChange={(e) => setStageKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
          onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">Probability %</span>
        <div className="flex items-center gap-1">
          <Input
            className="h-8 w-16 text-sm"
            type="number"
            min="0"
            max="100"
            value={prob}
            onChange={(e) => setProb(e.target.value)}
          />
          <span className="text-xs text-slate-400">%</span>
        </div>
      </div>
      <Button size="sm" className="h-8" onClick={() => void handleAdd()} disabled={saving}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        {saving ? "Adding…" : "Add Stage"}
      </Button>
    </div>
  );
}

export function EstimateStagesEditor() {
  const { data: stages = [], isLoading } = useEstimateStages();
  const { mutate: seed, isPending: seeding } = useSeedDefaultStages();

  useEffect(() => {
    if (!isLoading && stages.length === 0) {
      seed();
    }
  }, [isLoading, stages.length, seed]);

  if (isLoading || seeding) {
    return <p className="py-2 text-sm text-slate-400">Loading…</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-4 pb-2 border-b">
        <span className="flex-1 text-xs font-medium text-slate-500 uppercase tracking-wide">Name</span>
        <span className="w-24 text-xs font-medium text-slate-500 uppercase tracking-wide">Probability</span>
        <span className="w-20 text-xs font-medium text-slate-500 uppercase tracking-wide">Key</span>
        <span className="w-16 text-xs font-medium text-slate-500 uppercase tracking-wide">Active</span>
        <div className="w-7" />
      </div>
      <div className="divide-y">
        {stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} />
        ))}
      </div>
      <AddStageForm />
    </div>
  );
}
