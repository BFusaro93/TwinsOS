"use client";

import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useUpdateEvent } from "@/lib/hooks/use-crm-automations";
import type { CRMSequenceEvent } from "@/types/crm-automations";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: CRMSequenceEvent;
}

export function TagsEventDialog({ open, onOpenChange, event }: Props) {
  const updateEvent = useUpdateEvent();
  const [addTags, setAddTags] = useState<string[]>([]);
  const [removeTags, setRemoveTags] = useState<string[]>([]);
  const [addInput, setAddInput] = useState("");
  const [removeInput, setRemoveInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAddTags(event.config.add_tags ?? []);
      setRemoveTags(event.config.remove_tags ?? []);
      setAddInput("");
      setRemoveInput("");
    }
  }, [open, event]);

  function pushTag(
    input: string,
    list: string[],
    setList: (v: string[]) => void,
    setInput: (v: string) => void
  ) {
    const trimmed = input.trim();
    if (!trimmed || list.includes(trimmed)) return;
    setList([...list, trimmed]);
    setInput("");
  }

  function removeFromList(tag: string, list: string[], setList: (v: string[]) => void) {
    setList(list.filter((t) => t !== tag));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        sequenceId: event.sequenceId,
        config: { add_tags: addTags, remove_tags: removeTags },
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Tags</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Add tags */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-700">Add tags</p>
            <div className="flex gap-2">
              <Input
                placeholder="Tag name…"
                value={addInput}
                onChange={(e) => setAddInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    pushTag(addInput, addTags, setAddTags, setAddInput);
                  }
                }}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => pushTag(addInput, addTags, setAddTags, setAddInput)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {addTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {addTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 bg-green-50 text-green-700 border-green-200">
                    +{tag}
                    <button onClick={() => removeFromList(tag, addTags, setAddTags)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Remove tags */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-700">Remove tags</p>
            <div className="flex gap-2">
              <Input
                placeholder="Tag name…"
                value={removeInput}
                onChange={(e) => setRemoveInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    pushTag(removeInput, removeTags, setRemoveTags, setRemoveInput);
                  }
                }}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => pushTag(removeInput, removeTags, setRemoveTags, setRemoveInput)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {removeTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {removeTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 bg-red-50 text-red-700 border-red-200">
                    -{tag}
                    <button onClick={() => removeFromList(tag, removeTags, setRemoveTags)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || (addTags.length === 0 && removeTags.length === 0)}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
