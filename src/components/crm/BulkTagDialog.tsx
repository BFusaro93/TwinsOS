"use client";

import { useState } from "react";
import { useBulkAddTag, useBulkRemoveTag, useOrgTags } from "@/lib/hooks/use-clients";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientIds: string[];
}

export function BulkTagDialog({ open, onOpenChange, clientIds }: Props) {
  const orgTags = useOrgTags();
  const { mutateAsync: bulkAdd, isPending: adding } = useBulkAddTag();
  const { mutateAsync: bulkRemove, isPending: removing } = useBulkRemoveTag();
  const [mode, setMode] = useState<"add" | "remove">("add");

  const count = clientIds.length;

  async function handleTag(tag: string, action: "add" | "remove") {
    try {
      if (action === "add") {
        await bulkAdd({ clientIds, tag });
        toast.success(`Tag "${tag}" added to ${count} client${count !== 1 ? "s" : ""}`);
      } else {
        await bulkRemove({ clientIds, tag });
        toast.success(`Tag "${tag}" removed from ${count} client${count !== 1 ? "s" : ""}`);
      }
    } catch {
      toast.error("Failed to update tags");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add" : "Remove"} Tags — {count} client{count !== 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex rounded-md border overflow-hidden">
          <button
            className={`flex-1 py-1.5 text-sm transition-colors ${mode === "add" ? "bg-brand-600 text-white" : "hover:bg-slate-50 text-slate-600"}`}
            onClick={() => setMode("add")}
          >
            <Plus className="inline h-3.5 w-3.5 mr-1" />
            Add
          </button>
          <button
            className={`flex-1 py-1.5 text-sm transition-colors ${mode === "remove" ? "bg-red-600 text-white" : "hover:bg-slate-50 text-slate-600"}`}
            onClick={() => setMode("remove")}
          >
            <Minus className="inline h-3.5 w-3.5 mr-1" />
            Remove
          </button>
        </div>

        {/* Existing org tags */}
        {orgTags.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">Existing tags</p>
            <div className="flex flex-wrap gap-1.5">
              {orgTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="cursor-pointer hover:bg-slate-200 transition-colors text-xs"
                  onClick={() => handleTag(tag, mode)}
                >
                  {mode === "add" ? <Plus className="h-2.5 w-2.5 mr-1" /> : <Minus className="h-2.5 w-2.5 mr-1" />}
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {orgTags.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-2">
            No tags defined yet. Add tags in{" "}
            <a href="/crm/settings" className="underline text-brand-600">Settings → Tags</a>.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
