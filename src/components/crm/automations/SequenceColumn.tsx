"use client";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useSequenceEvents,
  useUpdateSequence,
  useDeleteEvent,
} from "@/lib/hooks/use-crm-automations";
import type { CRMSequence, CRMSequenceEvent, EventType } from "@/types/crm-automations";
import { EventCard } from "./EventCard";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { toast } from "sonner";

interface Props {
  sequence: CRMSequence;
  isFocused: boolean;
  onFocus: () => void;
  onRulesClick: () => void;
  onEventClick: (event: CRMSequenceEvent) => void;
  /** Step types that can be added inside an IF Branch block. */
  palette: { type: EventType; label: string; icon: React.ElementType }[];
  onAddInside: (type: EventType, parentEventId: string) => void;
  isAdding: boolean;
}

export function SequenceColumn({
  sequence, isFocused, onFocus, onRulesClick, onEventClick, palette, onAddInside, isAdding,
}: Props) {
  const { can } = usePermissions();
  const canModify = can("automation_create_modify");
  const canStop = can("automation_stop");
  const canAddTags = can("automation_add_tags");
  const { data: events } = useSequenceEvents(sequence.id);
  const updateSequence = useUpdateSequence();
  const deleteEvent = useDeleteEvent();

  // Steps grouped by the IF Branch they sit inside (null = top level). A step
  // whose parent is missing is shown at the top level rather than hidden.
  const eventIds = new Set((events ?? []).map((e) => e.id));
  const byParent = new Map<string | null, CRMSequenceEvent[]>();
  for (const ev of events ?? []) {
    const key = ev.parentEventId && eventIds.has(ev.parentEventId) ? ev.parentEventId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), ev]);
  }

  function handleDelete(ev: CRMSequenceEvent) {
    deleteEvent.mutate(
      { id: ev.id, sequenceId: ev.sequenceId },
      { onError: () => toast.error("Failed to delete event") }
    );
  }

  function renderLevel(parentId: string | null) {
    return (byParent.get(parentId) ?? []).map((ev) => (
      <div key={ev.id} className="flex flex-col gap-2">
        <EventCard
          event={ev}
          onClick={canModify && (ev.eventType !== "tags" || canAddTags) ? () => onEventClick(ev) : undefined}
          onDelete={canModify ? () => handleDelete(ev) : undefined}
        />
        {ev.eventType === "if_branch" && (
          <div className="ml-3 flex flex-col gap-2 border-l-2 border-orange-300 dark:border-orange-500/50 pl-3">
            {(byParent.get(ev.id) ?? []).length === 0 && (
              <p className="text-[11px] text-slate-400 dark:text-neutral-500">
                Nothing inside yet — add the steps that should only run when the conditions are met.
              </p>
            )}
            {renderLevel(ev.id)}
            {canModify && palette.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-fit gap-1 px-2 text-xs"
                    disabled={isAdding}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add step inside
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                  {palette.map(({ type, label, icon: Icon }) => (
                    <DropdownMenuItem key={type} onSelect={() => onAddInside(type, ev.id)}>
                      <Icon className="mr-2 h-4 w-4" />
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    ));
  }

  return (
    <Card
      onClick={onFocus}
      className={cn(
        "w-72 shrink-0 flex flex-col cursor-pointer transition-shadow",
        isFocused ? "ring-2 ring-primary shadow-md" : "hover:shadow-sm"
      )}
    >
      <CardHeader className="flex flex-row items-center gap-2 pb-2 pt-3 px-3 space-y-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100 truncate">{sequence.name}</p>
        </div>
        <Switch
          checked={sequence.isActive}
          disabled={!canStop}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(checked) =>
            updateSequence.mutate(
              {
                id: sequence.id,
                automationId: sequence.automationId,
                updates: { isActive: checked },
              },
              { onError: () => toast.error("Failed to update sequence") }
            )
          }
        />
        {canModify && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onRulesClick();
            }}
            title="Sequence rules"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Rules
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-2 px-3 pb-3">
        {(events ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-slate-400 dark:text-neutral-500">
            No events yet.
            <br />
            Click an event type on the left to add one.
          </div>
        ) : (
          renderLevel(null)
        )}
      </CardContent>
    </Card>
  );
}
