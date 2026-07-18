"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/crm/services/RichTextEditor";

export interface LineItemNotes {
  estimateDesc: string | null;
  jobNote: string | null;
  invoiceDesc: string | null;
  internalNote: string | null;
}

function hasNotes(notes: LineItemNotes): boolean {
  return !!(notes.estimateDesc || notes.jobNote || notes.invoiceDesc || notes.internalNote);
}

interface Props {
  notes: LineItemNotes;
  onSave: (notes: LineItemNotes) => void;
}

export function LineItemNotesPopover({ notes, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LineItemNotes>(notes);

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
          className="relative flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100"
          title="Line item notes"
        >
          <FileText className="h-3.5 w-3.5 text-slate-400" />
          {hasNotes(notes) && (
            <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-brand-500" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[480px] p-0" side="bottom" align="end">
        <Tabs defaultValue="estimate_desc">
          <div className="border-b px-3 pt-2">
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
            </TabsList>
          </div>

          <div className="h-[200px] overflow-y-auto p-3">
            <TabsContent value="estimate_desc" className="mt-0">
              <p className="mb-1.5 text-xs text-slate-500">Shown on the client-facing estimate document.</p>
              <RichTextEditor
                value={draft.estimateDesc ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, estimateDesc: v || null }))}
                minHeight={100}
                placeholder="Description shown on estimate…"
              />
            </TabsContent>

            <TabsContent value="job_note" className="mt-0">
              <p className="mb-1.5 text-xs text-slate-500">Carries to Job Notes for field crew when converting to a job.</p>
              <Textarea
                rows={6}
                value={draft.jobNote ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, jobNote: e.target.value || null }))}
                placeholder="Notes for crew…"
              />
            </TabsContent>

            <TabsContent value="invoice_desc" className="mt-0">
              <p className="mb-1.5 text-xs text-slate-500">Carries to the invoice line item description.</p>
              <Textarea
                rows={6}
                value={draft.invoiceDesc ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, invoiceDesc: e.target.value || null }))}
                placeholder="Description on invoice…"
              />
            </TabsContent>

            <TabsContent value="line_item" className="mt-0">
              <p className="mb-1.5 text-xs text-slate-500">Internal only — your client will not see this note.</p>
              <Textarea
                rows={6}
                value={draft.internalNote ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, internalNote: e.target.value || null }))}
                placeholder="Private internal note…"
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
