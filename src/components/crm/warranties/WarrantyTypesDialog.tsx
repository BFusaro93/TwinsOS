"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/shared/useConfirm";
import { useDeleteWarrantyType, useSaveWarrantyType, useWarrantyTypes } from "@/lib/hooks/use-warranties";
import { formatWarrantyTerm } from "@/lib/utils/warranty";

export function WarrantyTypesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: types = [] } = useWarrantyTypes();
  const save = useSaveWarrantyType();
  const del = useDeleteWarrantyType();
  const [confirm, confirmDialog] = useConfirm();
  const [name, setName] = useState("");
  const [months, setMonths] = useState("12");
  const [coverage, setCoverage] = useState("");

  async function add() {
    const m = Number.parseInt(months, 10);
    if (!name.trim() || !(m > 0)) return toast.error("Enter a name and a duration in months");
    try {
      await save.mutateAsync({ name, defaultDurationMonths: m, defaultCoverage: coverage });
      setName(""); setMonths("12"); setCoverage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save type");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Warranty types</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Pick a type when adding a warranty to pre-fill its duration and coverage wording.
        </p>
        <div className="max-h-56 divide-y overflow-y-auto rounded-md border">
          {types.length === 0 && <p className="p-3 text-sm text-muted-foreground">No types yet.</p>}
          {types.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 p-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{t.name} <span className="font-normal text-muted-foreground">· {formatWarrantyTerm(t.defaultDurationMonths)}</span></p>
                {t.defaultCoverage && <p className="truncate text-xs text-muted-foreground">{t.defaultCoverage}</p>}
              </div>
              <Button
                size="sm" variant="ghost" title="Delete type"
                onClick={async () => { if (await confirm({ title: `Delete "${t.name}"?`, description: "Existing warranties keep their details.", destructive: true, confirmLabel: "Delete" })) del.mutate(t.id); }}
              ><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Paver patio" /></div>
            <div className="space-y-1.5"><Label>Months</Label><Input type="number" min={1} value={months} onChange={(e) => setMonths(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Default coverage</Label><Input value={coverage} onChange={(e) => setCoverage(e.target.value)} placeholder="Optional" /></div>
          <Button size="sm" onClick={add} disabled={save.isPending}>Add type</Button>
        </div>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}
