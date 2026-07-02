"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import { useAIDraftLineItems, type AIDraftLineItem } from "@/lib/hooks/use-estimates";

interface Props {
  estimateId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAddItems: (items: AIDraftLineItem[]) => void;
}

export function AIDraftDialog({ estimateId, open, onOpenChange, onAddItems }: Props) {
  const [prompt, setPrompt] = useState("");
  const [suggestions, setSuggestions] = useState<AIDraftLineItem[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);

  const aiDraft = useAIDraftLineItems();

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setError(null);
    setSuggestions([]);
    setChecked([]);
    try {
      const items = await aiDraft.mutateAsync({ estimateId, prompt });
      setSuggestions(items);
      setChecked(items.map(() => true));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  function toggleChecked(idx: number) {
    setChecked((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  }

  function handleAdd() {
    const selected = suggestions.filter((_, i) => checked[i]);
    onAddItems(selected);
    onOpenChange(false);
    // reset for next open
    setPrompt("");
    setSuggestions([]);
    setChecked([]);
    setError(null);
  }

  const selectedCount = checked.filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-500" />
            Draft with AI
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="e.g. Weekly lawn mowing and monthly bed maintenance for a 15,000 sq ft residential property"
          />

          <Button
            onClick={handleGenerate}
            disabled={aiDraft.isPending || !prompt.trim()}
            className="self-start"
            size="sm"
          >
            {aiDraft.isPending ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-3.5 w-3.5" />
                Generate suggestions
              </>
            )}
          </Button>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {suggestions.length > 0 && (
            <>
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
                {suggestions.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-lg border bg-white p-3 shadow-sm"
                  >
                    <Checkbox
                      checked={checked[idx] ?? false}
                      onCheckedChange={() => toggleChecked(idx)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{item.serviceName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.qty} {item.unitType}
                        {item.visits > 1 ? ` × ${item.visits} visits` : ""}
                        {" · "}
                        {formatCurrency(item.rateCents)} / {item.unitType}
                      </p>
                      {item.estimateDesc && (
                        <p className="text-xs text-slate-400 mt-1 italic">{item.estimateDesc}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-slate-700">
                      {formatCurrency(Math.round(item.qty * item.rateCents * item.visits))}
                    </div>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleAdd}
                disabled={selectedCount === 0}
                size="sm"
              >
                Add {selectedCount} selected item{selectedCount !== 1 ? "s" : ""} to estimate
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
