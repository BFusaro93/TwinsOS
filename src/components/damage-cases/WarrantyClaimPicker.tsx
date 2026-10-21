"use client";

import { AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWarranties } from "@/lib/hooks/use-warranties";
import { formatDate } from "@/lib/utils";
import type { CRMWarranty } from "@/types/crm-warranties";

const NONE = "none";

/** True when the incident date falls inside the warranty's coverage window. */
export function warrantyCovers(w: CRMWarranty, incidentDate: string): boolean {
  return w.status === "active" && !!w.startDate && !!w.endDate && incidentDate >= w.startDate && incidentDate <= w.endDate;
}

/**
 * Links a warranty claim to the warranty it is claimed against. Choosing one
 * fills the customer; the incident date is checked against its coverage window.
 */
export function WarrantyClaimPicker({
  value,
  onChange,
  incidentDate,
}: {
  value: string | null;
  onChange: (warranty: CRMWarranty | null) => void;
  incidentDate: string;
}) {
  const { data: warranties = [] } = useWarranties();
  const options = warranties.filter((w) => w.status === "active" || w.id === value);
  const selected = options.find((w) => w.id === value) ?? null;
  const outside = selected && incidentDate && !warrantyCovers(selected, incidentDate);

  return (
    <div className="space-y-1.5">
      <Label>Warranty <span className="text-xs text-muted-foreground">(optional)</span></Label>
      <Select value={value ?? NONE} onValueChange={(id) => onChange(id === NONE ? null : options.find((w) => w.id === id) ?? null)}>
        <SelectTrigger><SelectValue placeholder="Link to a warranty…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not linked</SelectItem>
          {options.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.clientName ?? "Client"} — {w.name} (to {formatDate(w.endDate)})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {outside && selected && (
        <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Incident date is outside this warranty ({formatDate(selected.startDate)} – {formatDate(selected.endDate)}).
        </p>
      )}
    </div>
  );
}
