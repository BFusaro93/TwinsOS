"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDamageCase, useUpdateDamageCase } from "@/lib/hooks/use-damage-cases";
import type { DamageCaseType } from "@/types";

interface EditCaseData {
  id: string;
  caseType: DamageCaseType;
  customerName: string;
  propertyAddress: string | null;
  dateOfIncident: string;
  description: string;
  resolutionNotes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
  editCase?: EditCaseData;
}

export function NewDamageCaseDialog({ open, onOpenChange, onCreated, editCase }: Props) {
  const isEdit = !!editCase;
  const [caseType, setCaseType] = useState<DamageCaseType>(editCase?.caseType ?? "damage");
  const [customerName, setCustomerName] = useState(editCase?.customerName ?? "");
  const [propertyAddress, setPropertyAddress] = useState(editCase?.propertyAddress ?? "");
  const [dateOfIncident, setDateOfIncident] = useState(editCase?.dateOfIncident ?? "");
  const [description, setDescription] = useState(editCase?.description ?? "");
  const [resolutionNotes, setResolutionNotes] = useState(editCase?.resolutionNotes ?? "");
  const createCase = useCreateDamageCase();
  const updateCase = useUpdateDamageCase();

  // Sync form when editCase changes or dialog opens
  useEffect(() => {
    if (open && editCase) {
      setCaseType(editCase.caseType);
      setCustomerName(editCase.customerName);
      setPropertyAddress(editCase.propertyAddress ?? "");
      setDateOfIncident(editCase.dateOfIncident);
      setDescription(editCase.description);
      setResolutionNotes(editCase.resolutionNotes ?? "");
    } else if (open && !editCase) {
      setCaseType("damage");
      setCustomerName("");
      setPropertyAddress("");
      setDateOfIncident("");
      setDescription("");
      setResolutionNotes("");
    }
  }, [open, editCase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEdit && editCase) {
        await updateCase.mutateAsync({
          id: editCase.id,
          caseType,
          customerName,
          propertyAddress,
          dateOfIncident,
          description,
          resolutionNotes: resolutionNotes || null,
        });
        onOpenChange(false);
      } else {
        const result = await createCase.mutateAsync({
          caseType,
          customerName,
          propertyAddress,
          dateOfIncident,
          description,
        });
        onCreated?.(result.id);
        onOpenChange(false);
      }
    } catch {
      // error displayed below the form
    }
  };

  const isPending = isEdit ? updateCase.isPending : createCase.isPending;
  const error = isEdit ? updateCase.error : createCase.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Case" : "Open New Case"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Case Type</Label>
              <Select value={caseType} onValueChange={(v) => setCaseType(v as DamageCaseType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="damage">Damage</SelectItem>
                  <SelectItem value="warranty">Warranty</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date of Incident</Label>
              <Input type="date" value={dateOfIncident} onChange={(e) => setDateOfIncident(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Customer / Property Name</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required placeholder="e.g. Sterling Storage" />
          </div>
          <div className="space-y-1.5">
            <Label>Property Address <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} placeholder="123 Main St" />
          </div>
          <div className="space-y-1.5">
            <Label>Description of {caseType === "damage" ? "Damage" : "Warranty Issue"}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              placeholder={caseType === "damage" ? "e.g. Siding damage on north wall from mower" : "e.g. Plant died within warranty period — needs replacement"}
            />
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label>Resolution Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={2}
                placeholder="How was this case resolved?"
              />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive">{String(error)}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (isEdit ? "Saving…" : "Opening…") : (isEdit ? "Save Changes" : "Open Case")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
