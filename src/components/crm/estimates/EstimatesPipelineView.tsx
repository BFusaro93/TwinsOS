"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { cn, formatCurrency } from "@/lib/utils";
import type { Estimate, EstimateStage } from "@/types/crm-estimates";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";

// ── stage color palette ─────────────────────────────────────────────────────

const STAGE_DOT: Record<EstimateStage, string> = {
  draft:    "bg-slate-400",
  quote:    "bg-blue-500",
  sent:     "bg-yellow-500",
  approved: "bg-purple-500",
  won:      "bg-green-500",
  lost:     "bg-red-500",
  invoiced: "bg-teal-500",
};

const STAGE_HEADER: Record<EstimateStage, string> = {
  draft:    "border-slate-200  bg-slate-50",
  quote:    "border-blue-200   bg-blue-50",
  sent:     "border-yellow-200 bg-yellow-50",
  approved: "border-purple-200 bg-purple-50",
  won:      "border-green-200  bg-green-50",
  lost:     "border-red-200    bg-red-50",
  invoiced: "border-teal-200   bg-teal-50",
};

// Stages that collapse by default since they accumulate over time
const COLLAPSED_BY_DEFAULT: EstimateStage[] = ["won", "lost", "invoiced"];

// ── helpers ──────────────────────────────────────────────────────────────────

function padEstimateNumber(n: number): string {
  return `#${String(n).padStart(5, "0")}`;
}

function weightedRevenue(estimates: Estimate[]): number {
  return estimates.reduce(
    (sum, e) => sum + Math.round((e.totalCents * e.probabilityBps) / 10000),
    0
  );
}

// ── sub-components ───────────────────────────────────────────────────────────

interface EstimateCardProps {
  estimate: Estimate;
  onClick: (id: string) => void;
}

function EstimateCard({ estimate, onClick }: EstimateCardProps) {
  const probPct = Math.round(estimate.probabilityBps / 100);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: estimate.id,
  });

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={() => onClick(estimate.id)}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
          : undefined
      }
      className={cn(
        "w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      {/* top row: estimate number + probability */}
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="font-mono text-[10px] text-slate-400">
          {padEstimateNumber(estimate.estimateNumber)}
        </span>
        {probPct > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-medium">
            {probPct}%
          </Badge>
        )}
      </div>
      {/* client name */}
      <p className="mb-0.5 text-sm font-semibold leading-tight text-slate-900 line-clamp-1">
        {estimate.clientName ?? "—"}
      </p>
      {/* description */}
      {estimate.description && (
        <p className="mb-1.5 truncate text-xs text-slate-500">
          {estimate.description}
        </p>
      )}
      {/* total */}
      <p className="text-sm font-bold text-brand-600">
        {estimate.totalCents > 0 ? formatCurrency(estimate.totalCents) : "—"}
      </p>
    </button>
  );
}

// ── pipeline column ──────────────────────────────────────────────────────────

interface PipelineColumnProps {
  stageKey: EstimateStage;
  stageName: string;
  estimates: Estimate[];
  onEstimateClick: (id: string) => void;
  collapsible?: boolean;
}

function PipelineColumn({
  stageKey,
  stageName,
  estimates,
  onEstimateClick,
  collapsible = false,
}: PipelineColumnProps) {
  const [expanded, setExpanded] = useState(!collapsible);
  const weighted = weightedRevenue(estimates);
  const { setNodeRef, isOver } = useDroppable({ id: stageKey });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[260px] shrink-0 flex-col gap-2 rounded-md",
        isOver && "bg-brand-50 ring-2 ring-brand-300"
      )}
    >
      {/* column header */}
      <div
        className={cn(
          "rounded-md border px-3 py-2",
          STAGE_HEADER[stageKey]
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full shrink-0", STAGE_DOT[stageKey])} />
          <span className="flex-1 text-xs font-semibold text-slate-700 leading-tight">
            {stageName}
          </span>
          <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
            {estimates.length}
          </span>
          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-0.5 text-slate-400 hover:text-slate-600"
              aria-label={expanded ? "Collapse column" : "Expand column"}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
        {weighted > 0 && (
          <p className="mt-1 text-[10px] text-slate-500">
            {formatCurrency(weighted)} weighted
          </p>
        )}
      </div>

      {/* cards */}
      {!expanded && collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-md border border-dashed border-slate-200 py-2 text-center text-xs text-slate-400 hover:border-slate-300 hover:text-slate-500"
        >
          Show {estimates.length} estimate{estimates.length !== 1 ? "s" : ""}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          {estimates.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
              No estimates
            </div>
          ) : (
            estimates.map((e) => (
              <EstimateCard key={e.id} estimate={e} onClick={onEstimateClick} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────

export interface EstimatesPipelineViewProps {
  estimates: Estimate[];
  stages: { stageKey: string; name: string; probabilityBps: number }[];
  onEstimateClick: (id: string) => void;
  /**
   * Called when a card is dropped on a different column. `"sent"` is
   * intentionally NOT routed through this — dropping onto Sent opens the
   * estimate instead (see onEstimateClick), since actually sending requires
   * the compose dialog and its approval gate, which only exist there.
   */
  onStageChange: (estimateId: string, newStage: string) => void;
}

export function EstimatesPipelineView({
  estimates,
  stages,
  onEstimateClick,
  onStageChange,
}: EstimatesPipelineViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const estimateId = event.active.id as string;
    const targetStage = event.over?.id as string | undefined;
    if (!targetStage) return;

    const estimate = estimates.find((e) => e.id === estimateId);
    if (!estimate || estimate.stage === targetStage) return;

    if (targetStage === "sent") {
      // Sending requires the compose dialog + approval gate — open the
      // estimate rather than silently flipping its stage.
      onEstimateClick(estimateId);
      return;
    }

    onStageChange(estimateId, targetStage);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Estimate[]>();
    for (const s of stages) map.set(s.stageKey, []);
    for (const e of estimates) {
      const bucket = map.get(e.stage);
      if (bucket) bucket.push(e);
      else map.set(e.stage, [e]);
    }
    // Sort each bucket by updatedAt descending
    for (const bucket of map.values()) {
      bucket.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }
    return map;
  }, [estimates, stages]);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <div className="flex gap-3 p-4" style={{ minWidth: "max-content" }}>
          {stages.map((stage) => {
            const stageKey = stage.stageKey as EstimateStage;
            const bucket = grouped.get(stage.stageKey) ?? [];
            return (
              <PipelineColumn
                key={stage.stageKey}
                stageKey={stageKey}
                stageName={stage.name}
                estimates={bucket}
                onEstimateClick={onEstimateClick}
                collapsible={COLLAPSED_BY_DEFAULT.includes(stageKey)}
              />
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}
