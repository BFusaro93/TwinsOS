"use client";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Settings2 } from "lucide-react";
import {
  useSequenceEvents,
  useUpdateSequence,
  useDeleteEvent,
} from "@/lib/hooks/use-crm-automations";
import type { CRMSequence, CRMSequenceEvent } from "@/types/crm-automations";
import { EventCard } from "./EventCard";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { toast } from "sonner";

interface Props {
  sequence: CRMSequence;
  isFocused: boolean;
  onFocus: () => void;
  onRulesClick: () => void;
  onEventClick: (event: CRMSequenceEvent) => void;
}

export function SequenceColumn({ sequence, isFocused, onFocus, onRulesClick, onEventClick }: Props) {
  const { can } = usePermissions();
  const canModify = can("automation_create_modify");
  const canStop = can("automation_stop");
  const canAddTags = can("automation_add_tags");
  const { data: events } = useSequenceEvents(sequence.id);
  const updateSequence = useUpdateSequence();
  const deleteEvent = useDeleteEvent();

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
          <p className="text-sm font-semibold text-slate-800 truncate">{sequence.name}</p>
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
          <div className="rounded-md border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
            No events yet.
            <br />
            Click an event type on the left to add one.
          </div>
        ) : (
          (events ?? []).map((ev) => (
            <EventCard
              key={ev.id}
              event={ev}
              onClick={canModify && (ev.eventType !== "tags" || canAddTags) ? () => onEventClick(ev) : undefined}
              onDelete={
                canModify
                  ? () =>
                      deleteEvent.mutate(
                        { id: ev.id, sequenceId: ev.sequenceId },
                        { onError: () => toast.error("Failed to delete event") }
                      )
                  : undefined
              }
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
