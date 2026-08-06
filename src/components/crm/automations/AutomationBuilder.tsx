"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Mail,
  GitBranch,
  StickyNote,
  MessageSquare,
  Tag,
  RefreshCw,
  Clock,
  Hash,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAutomation,
  useUpdateAutomation,
  useSequences,
  useCreateSequence,
  useSequenceEvents,
  useCreateEvent,
  useDeleteEvent,
} from "@/lib/hooks/use-crm-automations";
import type { CRMSequence, CRMSequenceEvent, EventType } from "@/types/crm-automations";
import { SequenceColumn } from "./SequenceColumn";
import { SequenceRulesDialog } from "./SequenceRulesDialog";
import { WaitEventDialog } from "./WaitEventDialog";
import { EmailEventDialog } from "./EmailEventDialog";
import { AlertEventDialog } from "./AlertEventDialog";
import { TicketEventDialog } from "./TicketEventDialog";
import { TextEventDialog } from "./TextEventDialog";
import { NoteEventDialog } from "./NoteEventDialog";
import { UpdateEventDialog } from "./UpdateEventDialog";
import { TagsEventDialog } from "./TagsEventDialog";
import { IfBranchEventDialog } from "./IfBranchEventDialog";
import { toast } from "sonner";

interface Props {
  automationId: string;
}

interface EventPalette {
  type: EventType;
  label: string;
  icon: React.ElementType;
}

const EVENT_PALETTE: EventPalette[] = [
  { type: "alert", label: "Alert", icon: Bell },
  { type: "email", label: "Email", icon: Mail },
  { type: "if_branch", label: "IF Branch", icon: GitBranch },
  { type: "note", label: "Note", icon: StickyNote },
  { type: "text_message", label: "Text Message", icon: MessageSquare },
  { type: "ticket", label: "Ticket", icon: Tag },
  { type: "update", label: "Update", icon: RefreshCw },
  { type: "wait", label: "Wait", icon: Clock },
  { type: "tags", label: "Tags", icon: Hash },
];

export function AutomationBuilder({ automationId }: Props) {
  const router = useRouter();
  const { data: automation, isLoading } = useAutomation(automationId);
  const { data: sequences } = useSequences(automationId);
  const updateAutomation = useUpdateAutomation();
  const createSequence = useCreateSequence();
  const createEvent = useCreateEvent();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [focusedSequenceId, setFocusedSequenceId] = useState<string | null>(null);
  const [rulesSequenceId, setRulesSequenceId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CRMSequenceEvent | null>(null);

  function startEditName() {
    setNameValue(automation?.name ?? "");
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }

  function saveName() {
    if (!nameValue.trim() || nameValue === automation?.name) {
      setEditingName(false);
      return;
    }
    updateAutomation.mutate(
      { id: automationId, updates: { name: nameValue.trim() } },
      { onError: () => toast.error("Failed to rename automation") }
    );
    setEditingName(false);
  }

  async function handleAddSequence() {
    if (createSequence.isPending) return;
    try {
      const seq = await createSequence.mutateAsync({
        automationId,
        name: `Sequence ${(sequences?.length ?? 0) + 1}`,
        position: sequences?.length ?? 0,
      });
      setFocusedSequenceId(seq.id);
    } catch {
      toast.error("Failed to add sequence");
    }
  }

  async function handleAddEvent(type: EventType) {
    if (!focusedSequenceId || createEvent.isPending) return;
    try {
      await createEvent.mutateAsync({
        sequenceId: focusedSequenceId,
        eventType: type,
        config: {},
        position: 0,
      });
    } catch {
      toast.error("Failed to add event");
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center gap-3 border-b px-4">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="flex flex-1 items-center justify-center text-slate-400 text-sm">
          Loading…
        </div>
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400 text-sm">
        Automation not found.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-white px-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {editingName ? (
          <Input
            ref={nameInputRef}
            className="h-8 w-64 text-sm font-medium"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") setEditingName(false);
            }}
          />
        ) : (
          <button
            onClick={startEditName}
            className="text-sm font-semibold text-slate-800 hover:text-brand-600 transition-colors"
          >
            {automation.name}
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-active"
              checked={automation.isActive}
              onCheckedChange={(checked) =>
                updateAutomation.mutate(
                  { id: automationId, updates: { isActive: checked } },
                  { onError: () => toast.error("Failed to update automation") }
                )
              }
            />
            <Label htmlFor="auto-active" className="text-sm cursor-pointer">
              Active
            </Label>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Event palette sidebar */}
        <div className="flex w-48 shrink-0 flex-col border-r bg-slate-50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Events
          </p>
          {EVENT_PALETTE.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => handleAddEvent(type)}
              disabled={!focusedSequenceId || createEvent.isPending}
              className="flex cursor-grab items-center gap-2 rounded p-2 text-sm text-slate-700 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              title={focusedSequenceId ? `Add ${label}` : "Select a sequence first"}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
          {!focusedSequenceId && (
            <p className="mt-3 text-[10px] text-slate-400 leading-tight">
              Click a sequence to select it, then add events.
            </p>
          )}
        </div>

        {/* Sequences canvas */}
        <div className="flex flex-1 gap-4 overflow-x-auto p-4">
          {(sequences ?? []).map((seq) => (
            <SequenceColumn
              key={seq.id}
              sequence={seq}
              isFocused={focusedSequenceId === seq.id}
              onFocus={() => setFocusedSequenceId(seq.id)}
              onRulesClick={() => setRulesSequenceId(seq.id)}
              onEventClick={(ev) => setEditingEvent(ev)}
            />
          ))}

          {/* Add sequence */}
          <button
            onClick={handleAddSequence}
            disabled={createSequence.isPending}
            className="flex h-fit w-72 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-8 text-sm text-slate-400 transition-colors hover:border-brand-400 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-5 w-5" />
            Add Sequence
          </button>
        </div>
      </div>

      {/* Rules dialog */}
      {rulesSequenceId && (
        <SequenceRulesDialog
          open={!!rulesSequenceId}
          onOpenChange={(v) => !v && setRulesSequenceId(null)}
          sequenceId={rulesSequenceId}
          automationId={automationId}
        />
      )}

      {/* Event dialogs */}
      {editingEvent && editingEvent.eventType === "wait" && (
        <WaitEventDialog
          open
          onOpenChange={(v) => !v && setEditingEvent(null)}
          event={editingEvent}
        />
      )}
      {editingEvent && editingEvent.eventType === "email" && (
        <EmailEventDialog
          open
          onOpenChange={(v) => !v && setEditingEvent(null)}
          event={editingEvent}
        />
      )}
      {editingEvent && editingEvent.eventType === "alert" && (
        <AlertEventDialog
          open
          onOpenChange={(v) => !v && setEditingEvent(null)}
          event={editingEvent}
        />
      )}
      {editingEvent && editingEvent.eventType === "ticket" && (
        <TicketEventDialog
          open
          onOpenChange={(v) => !v && setEditingEvent(null)}
          event={editingEvent}
        />
      )}
      {editingEvent && editingEvent.eventType === "text_message" && (
        <TextEventDialog
          open
          onOpenChange={(v) => !v && setEditingEvent(null)}
          event={editingEvent}
        />
      )}
      {editingEvent && editingEvent.eventType === "note" && (
        <NoteEventDialog
          open
          onOpenChange={(v) => !v && setEditingEvent(null)}
          event={editingEvent}
        />
      )}
      {editingEvent && editingEvent.eventType === "update" && (
        <UpdateEventDialog
          open
          onOpenChange={(v) => !v && setEditingEvent(null)}
          event={editingEvent}
        />
      )}
      {editingEvent && editingEvent.eventType === "tags" && (
        <TagsEventDialog
          open
          onOpenChange={(v) => !v && setEditingEvent(null)}
          event={editingEvent}
        />
      )}
      {editingEvent && editingEvent.eventType === "if_branch" && (
        <IfBranchEventDialog
          open
          onOpenChange={(v) => !v && setEditingEvent(null)}
          event={editingEvent}
        />
      )}
    </div>
  );
}
