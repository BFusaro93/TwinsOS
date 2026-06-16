"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDamageCase } from "@/lib/hooks/use-damage-cases";
import type { DamageCaseType } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}

export function NewDamageCaseDialog({ open, onOpenChange, onCreated }: Props) {
  const [caseType, setCaseType] = useState<DamageCaseType>("damage");
  const [customerName, setCustomerName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [dateOfIncident, setDateOfIncident] = useState("");
  const [description, setDescription] = useState("");
  const createCase = useCreateDamageCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createCase.mutateAsync({
        caseType,
        customerName,
        propertyAddress,
        dateOfIncident,
        description,
      });
      onCreated?.(result.id);
      onOpenChange(false);
      setCaseType("damage");
      setCustomerName("");
      setPropertyAddress("");
      setDateOfIncident("");
      setDescription("");
    } catch {
      // error displayed below the form via createCase.error
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Open New Case</DialogTitle>
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
          {createCase.error && (
            <p className="text-sm text-destructive">{String(createCase.error)}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createCase.isPending}>
              {createCase.isPending ? "Opening…" : "Open Case"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
