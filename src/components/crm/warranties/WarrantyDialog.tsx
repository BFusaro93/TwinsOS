"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientCombobox } from "@/components/shared/ClientCombobox";
import { useClients } from "@/lib/hooks/use-clients";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import {
  useCreateWarranty,
  useUpdateWarranty,
  useWarrantyTypes,
  type WarrantyScope,
} from "@/lib/hooks/use-warranties";
import { formatDate } from "@/lib/utils";
import { warrantyEndFromTerm } from "@/lib/utils/warranty";
import type { CRMWarranty } from "@/types/crm-warranties";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the warranty is being added from. clientId is required unless the user picks one. */
  scope?: WarrantyScope;
  /** Set when the warranty is added to a project: leaving the start blank means "starts when the project completes". */
  projectComplete?: boolean;
  editing?: CRMWarranty | null;
}

const NO_TYPE = "none";

export function WarrantyDialog({ open, onOpenChange, scope = {}, projectComplete = false, editing }: Props) {
  const { data: types = [] } = useWarrantyTypes();
  const { data: clients = [] } = useClients();
  const { today } = useOrgDates();
  const create = useCreateWarranty();
  const update = useUpdateWarranty();

  const [clientId, setClientId] = useState("");
  const [typeId, setTypeId] = useState(NO_TYPE);
  const [name, setName] = useState("");
  const [coverage, setCoverage] = useState("");
  const [months, setMonths] = useState("12");
  const [startDate, setStartDate] = useState("");
  const [damages, setDamages] = useState("");
  const [notes, setNotes] = useState("");

  const isProjectScoped = !!(editing?.projectId ?? scope.projectId);
  // A project-scoped warranty with no start waits for the project to complete.
  const deferStart = isProjectScoped && !projectComplete && !editing?.startDate;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setClientId(editing.clientId);
      setTypeId(editing.warrantyTypeId ?? NO_TYPE);
      setName(editing.name);
      setCoverage(editing.coverage ?? "");
      setMonths(String(editing.durationMonths));
      setStartDate(editing.startDate ?? "");
      setDamages(editing.damagesCoveredCents != null ? (editing.damagesCoveredCents / 100).toFixed(2) : "");
      setNotes(editing.notes ?? "");
    } else {
      setClientId(scope.clientId ?? "");
      setTypeId(NO_TYPE);
      setName("");
      setCoverage("");
      setMonths("12");
      setStartDate(isProjectScoped && !projectComplete ? "" : today());
      setDamages("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const monthsNum = Number.parseInt(months, 10);
  const endDate = useMemo(
    () => (startDate && monthsNum > 0 ? warrantyEndFromTerm(startDate, monthsNum) : null),
    [startDate, monthsNum],
  );

  function pickType(id: string) {
    setTypeId(id);
    const t = types.find((x) => x.id === id);
    if (!t) return;
    if (!name.trim()) setName(t.name);
    setMonths(String(t.defaultDurationMonths));
    if (!coverage.trim() && t.defaultCoverage) setCoverage(t.defaultCoverage);
  }

  const busy = create.isPending || update.isPending;

  async function save() {
    if (!clientId) return toast.error("Choose a client");
    if (!name.trim()) return toast.error("Give the warranty a name");
    if (!(monthsNum > 0)) return toast.error("Duration must be at least 1 month");
    if (!startDate && !deferStart) return toast.error("Enter a start date");
    const damagesNum = damages.trim() ? Math.round(Number.parseFloat(damages) * 100) : null;
    if (damagesNum != null && !(damagesNum >= 0)) return toast.error("Damages covered must be a positive amount");

    const input = {
      clientId,
      projectId: editing?.projectId ?? scope.projectId ?? null,
      jobId: editing?.jobId ?? scope.jobId ?? null,
      warrantyTypeId: typeId === NO_TYPE ? null : typeId,
      name,
      coverage,
      durationMonths: monthsNum,
      startDate: startDate || null,
      endDate: startDate ? endDate : null,
      damagesCoveredCents: damagesNum,
      notes,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...input, renewedFromId: editing.renewedFromId });
      else await create.mutateAsync(input);
      toast.success(editing ? "Warranty updated" : "Warranty added");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save warranty");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit warranty" : "Add warranty"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!scope.clientId && !editing && (
            <div className="space-y-1.5">
              <Label>Client</Label>
              <ClientCombobox clients={clients} value={clientId} onValueChange={setClientId} noneLabel="Select client…" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Warranty type</Label>
            <Select value={typeId} onValueChange={pickType}>
              <SelectTrigger><SelectValue placeholder="Choose a type…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TYPE}>Custom</SelectItem>
                {types.filter((t) => t.isActive).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name} ({t.defaultDurationMonths} mo)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Retaining wall — 5 year" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Duration (months)</Label>
              <Input type="number" min={1} value={months} onChange={(e) => setMonths(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Damages covered ($, optional)</Label>
              <Input type="number" min={0} step="0.01" value={damages} onChange={(e) => setDamages(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Expires</Label>
              <Input value={endDate ? formatDate(endDate) : "—"} readOnly className="bg-muted/50" />
            </div>
          </div>
          {deferStart && !startDate && (
            <p className="text-xs text-muted-foreground">
              Leave the start blank and the warranty begins automatically when the project is marked complete.
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Coverage</Label>
            <Textarea rows={2} value={coverage} onChange={(e) => setCoverage(e.target.value)} placeholder="What is and isn't covered" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
