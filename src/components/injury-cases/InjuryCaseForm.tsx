"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INJURY_CLAIM_ROUTE_LABELS, INJURY_SEVERITY_LABELS, INJURY_TYPE_OPTIONS } from "@/lib/constants";
import type { InjuryCaseInput } from "@/lib/hooks/use-injury-cases";
import type { InjuryClaimRoute, InjurySeverity } from "@/types";

interface Props {
  initial?: Partial<InjuryCaseInput>;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  error?: unknown;
  onSubmit: (values: InjuryCaseInput) => void | Promise<void>;
  onCancel?: () => void;
}

/** Shared by the Injury Cases dialog and the field "Injury Report" page. */
export function InjuryCaseForm({ initial, submitLabel, pendingLabel, pending, error, onSubmit, onCancel }: Props) {
  const [employeeName, setEmployeeName] = useState(initial?.employeeName ?? "");
  const [dateOfIncident, setDateOfIncident] = useState(
    initial?.dateOfIncident ?? new Date().toLocaleDateString("en-CA"),
  );
  const [severity, setSeverity] = useState<InjurySeverity>(initial?.severity ?? "first_aid");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [injuryType, setInjuryType] = useState(initial?.injuryType ?? "");
  const [bodyPart, setBodyPart] = useState(initial?.bodyPart ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [treatment, setTreatment] = useState(initial?.treatment ?? "");
  const [daysAway, setDaysAway] = useState(String(initial?.daysAway ?? 0));
  const [recordable, setRecordable] = useState(initial?.recordable ?? false);
  const [claimRoute, setClaimRoute] = useState<string>(initial?.claimRoute ?? "undecided");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({
          employeeName: employeeName.trim(),
          dateOfIncident,
          severity,
          location: location.trim() || null,
          injuryType: injuryType || null,
          bodyPart: bodyPart.trim() || null,
          description: description.trim(),
          treatment: treatment.trim() || null,
          daysAway: Math.max(0, parseInt(daysAway, 10) || 0),
          recordable,
          claimRoute: claimRoute === "undecided" ? null : (claimRoute as InjuryClaimRoute),
        });
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Injured Employee</Label>
          <Input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} required placeholder="Full name" />
        </div>
        <div className="space-y-1.5">
          <Label>Date of Incident</Label>
          <Input type="date" value={dateOfIncident} onChange={(e) => setDateOfIncident(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Where did it happen? <span className="text-xs text-muted-foreground">(optional)</span></Label>
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Job site, shop, vehicle…" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Type of Injury <span className="text-xs text-muted-foreground">(optional)</span></Label>
          <Select value={injuryType} onValueChange={setInjuryType}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {INJURY_TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Body Part <span className="text-xs text-muted-foreground">(optional)</span></Label>
          <Input value={bodyPart} onChange={(e) => setBodyPart(e.target.value)} placeholder="e.g. Left hand" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>What happened?</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          placeholder="Describe how the injury occurred"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Severity</Label>
          <Select value={severity} onValueChange={(v) => setSeverity(v as InjurySeverity)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(INJURY_SEVERITY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Days Away From Work</Label>
          <Input type="number" min={0} value={daysAway} onChange={(e) => setDaysAway(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Treatment Given <span className="text-xs text-muted-foreground">(optional)</span></Label>
        <Textarea value={treatment} onChange={(e) => setTreatment(e.target.value)} rows={2} placeholder="First aid, clinic visit, ER…" />
      </div>
      <div className="space-y-1.5">
        <Label>Cost handled through</Label>
        <Select value={claimRoute} onValueChange={setClaimRoute}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="undecided">Not decided yet</SelectItem>
            {Object.entries(INJURY_CLAIM_ROUTE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Choose self-pay if the company covers the costs instead of filing a workers&apos; comp claim — track them on the Expenses tab.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={recordable} onCheckedChange={(c) => setRecordable(c === true)} />
        OSHA recordable
      </label>
      {error ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : String(error)}</p> : null}
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={pending}>{pending ? pendingLabel : submitLabel}</Button>
      </div>
    </form>
  );
}
