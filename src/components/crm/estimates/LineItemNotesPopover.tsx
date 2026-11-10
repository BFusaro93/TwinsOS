"use client";

import { useState } from "react";
import { FileText, Maximize2, Minimize2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/crm/services/RichTextEditor";
import { isBlankRich } from "@/lib/utils/visit-note";

export interface LineItemNotes {
  estimateDesc: string | null;
  jobNote: string | null;
  invoiceDesc: string | null;
  internalNote: string | null;
  /** Sq ft this line treats, when it differs from the property measurement. */
  treatedArea: number | null;
}

function hasNotes(notes: LineItemNotes): boolean {
  return !!(notes.estimateDesc || notes.jobNote || notes.invoiceDesc || notes.internalNote || notes.treatedArea);
}

interface Props {
  notes: LineItemNotes;
  onSave: (notes: LineItemNotes) => void;
  /** The line's catalog service tracks chemicals — only then is Treated Area meaningful. */
  isChemical?: boolean;
}

export function LineItemNotesPopover({ notes, onSave, isChemical = false }: Props) {
  // A line that already has a treated area keeps the tab, so saved data stays editable.
  const showTreatedArea = isChemical || notes.treatedArea != null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LineItemNotes>(notes);
  // Long quotes need room: an Expand toggle widens the box and makes the editor taller.
  // Remembered per browser so it stays the way the user left it.
  const [expanded, setExpanded] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem("lineItemNotesExpanded") === "1";
    } catch {
      return false;
    }
  });
  const editorMinHeight = expanded ? 340 : 100;

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("lineItemNotesExpanded", next ? "1" : "0");
      } catch {
        // storage unavailable — the toggle still works for this session
      }
      return next;
    });
  }

  function handleOpen(o: boolean) {
    if (o) setDraft(notes); // reset to saved on open
    setOpen(o);
  }

  function handleApply() {
    onSave(draft);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
          title="Line item notes"
        >
          <FileText className="h-3.5 w-3.5 text-slate-400 dark:text-neutral-500" />
          {hasNotes(notes) && (
            <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-brand-500" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={expanded ? "w-[min(920px,92vw)] p-0" : "w-[480px] p-0"}
        side="bottom"
        align="end"
        collisionPadding={12}
      >
        <Tabs defaultValue="estimate_desc">
          <div className="flex items-start justify-between border-b px-3 pt-2">
            <TabsList className="h-8 gap-1 bg-transparent p-0">
              <TabsTrigger value="estimate_desc" className="h-7 rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-brand-500 data-[state=active]:bg-transparent">
                Estimate Desc
              </TabsTrigger>
              <TabsTrigger value="job_note" className="h-7 rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-brand-500 data-[state=active]:bg-transparent">
                Job Note
              </TabsTrigger>
              <TabsTrigger value="invoice_desc" className="h-7 rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-brand-500 data-[state=active]:bg-transparent">
                Invoice Desc
              </TabsTrigger>
              <TabsTrigger value="line_item" className="h-7 rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-brand-500 data-[state=active]:bg-transparent">
                Line Item
              </TabsTrigger>
              {showTreatedArea && <TabsTrigger value="treated_area" className="h-7 rounded-none border-b-2 border-transparent px-2 text-xs data-[state=active]:border-brand-500 data-[state=active]:bg-transparent">
                Treated Area
              </TabsTrigger>}
            </TabsList>
            <button
              type="button"
              onClick={toggleExpanded}
              className="flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-muted"
              title={expanded ? "Make this box smaller" : "Make this box bigger for long descriptions"}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {expanded ? "Smaller" : "Bigger"}
            </button>
          </div>

          <div className={expanded ? "h-[min(65vh,560px)] overflow-y-auto p-3" : "h-[260px] overflow-y-auto p-3"}>
            <TabsContent value="estimate_desc" className="mt-0">
              <p className="mb-1.5 text-xs text-muted-foreground">Shown on the client-facing estimate document.</p>
              <RichTextEditor
                value={draft.estimateDesc ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, estimateDesc: v || null }))}
                minHeight={editorMinHeight}
                placeholder="Description shown on estimate…"
              />
            </TabsContent>

            <TabsContent value="job_note" className="mt-0">
              <p className="mb-1.5 text-xs text-muted-foreground">Carries to this service&apos;s crew note on the job and its visits when converting.</p>
              <RichTextEditor
                value={draft.jobNote ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, jobNote: isBlankRich(v) ? null : v }))}
                minHeight={editorMinHeight}
                placeholder="Notes for crew…"
              />
            </TabsContent>

            <TabsContent value="invoice_desc" className="mt-0">
              <p className="mb-1.5 text-xs text-muted-foreground">Carries to this service&apos;s invoice line description on the job.</p>
              <Textarea
                rows={expanded ? 14 : 6}
                value={draft.invoiceDesc ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, invoiceDesc: e.target.value || null }))}
                placeholder="Description on invoice…"
              />
            </TabsContent>

            <TabsContent value="line_item" className="mt-0">
              <p className="mb-1.5 text-xs text-muted-foreground">Internal only — carries to the job service&apos;s office note; never shown to the client or crew.</p>
              <RichTextEditor
                value={draft.internalNote ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, internalNote: isBlankRich(v) ? null : v }))}
                minHeight={editorMinHeight}
                placeholder="Private internal note…"
              />
            </TabsContent>

            <TabsContent value="treated_area" className="mt-0">
              <p className="mb-1.5 text-xs text-muted-foreground">
                Area this line actually treats (a spot treatment, the front lawn only), in the same unit as the
                service&apos;s area field: sq ft, or linear ft for a service sized by a linear-foot field such as
                Perimeter. Chemical quantities on the Materials Needed, Load List and crew app use this instead of the
                property measurement. Leave blank to use the property measurement.
              </p>
              <Input
                type="number"
                min={0}
                step="any"
                className="w-40"
                value={draft.treatedArea ?? ""}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setDraft((d) => ({ ...d, treatedArea: Number.isFinite(v) && v > 0 ? v : null }));
                }}
                placeholder="Sq ft / lin ft"
              />
            </TabsContent>
          </div>

          <div className="flex justify-end gap-2 border-t px-3 py-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleApply}>Apply</Button>
          </div>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
