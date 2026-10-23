"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDamageCase } from "@/lib/hooks/use-damage-cases";
import { useUploadAttachment } from "@/lib/hooks/use-attachments";
import { DamagePhotoPicker, useDamagePhotos } from "@/components/damage-cases/DamagePhotoPicker";
import { DamageClientPicker } from "@/components/damage-cases/DamageClientPicker";
import type { DamageCaseType } from "@/types";

/** Field "Damage Report" — submitting opens a new Damage Case. */
export function DamageReportForm() {
  const createCase = useCreateDamageCase();
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [caseType, setCaseType] = useState<DamageCaseType>("damage");
  const [customerName, setCustomerName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [dateOfIncident, setDateOfIncident] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [description, setDescription] = useState("");
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const photoState = useDamagePhotos();
  const uploadPhotos = useUploadAttachment("damage_case", "");

  function reset() {
    photoState.clear();
    setUploadWarning(null);
    setSubmitted(null);
    setCaseType("damage");
    setCustomerName("");
    setPropertyAddress("");
    setDateOfIncident(new Date().toLocaleDateString("en-CA"));
    setDescription("");
    createCase.reset();
  }

  return (
    <div className="mx-auto w-full max-w-xl p-4 md:p-6">
      <h1 className="text-xl font-semibold">Damage Report</h1>
      <p className="mb-4 text-sm text-muted-foreground">Report property damage or a warranty issue. This opens a new damage case for the office to follow up on.</p>
      {submitted ? (
        <div className="space-y-4 rounded-lg border bg-card p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600 dark:text-green-400" />
          <p className="font-medium">Report submitted — case {submitted} opened.</p>
          {uploadWarning ? <p className="text-sm text-destructive">{uploadWarning}</p> : null}
          <Button variant="outline" onClick={reset}>File another report</Button>
        </div>
      ) : (
        <form
          className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const created = await createCase.mutateAsync({
                caseType,
                customerName: customerName.trim(),
                propertyAddress: propertyAddress.trim(),
                dateOfIncident,
                description: description.trim(),
              });
              if (photoState.files.length) {
                const results = await uploadPhotos.mutateAsync({ files: photoState.files, recordId: created.id });
                const failed = results.filter((r) => !r.ok);
                if (failed.length) {
                  setUploadWarning(`${failed.length} photo${failed.length === 1 ? "" : "s"} could not be uploaded — the office can add them to the case.`);
                }
              }
              setSubmitted(created.caseNumber);
            } catch {
              // shown under the form
            }
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Report Type</Label>
              <Select value={caseType} onValueChange={(v) => setCaseType(v as DamageCaseType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
          <DamageClientPicker onPick={(c) => { setCustomerName(c.name); if (!propertyAddress) setPropertyAddress(c.address); }} />
          <div className="space-y-1.5">
            <Label>Customer / Property Name</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required placeholder="e.g. Sterling Storage" />
          </div>
          <div className="space-y-1.5">
            <Label>Property Address <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Input value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} placeholder="123 Main St" />
          </div>
          <div className="space-y-1.5">
            <Label>What happened?</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={4}
              placeholder={caseType === "damage" ? "e.g. Siding damage on north wall from mower" : "e.g. Plant died within warranty period — needs replacement"}
            />
          </div>
          <DamagePhotoPicker state={photoState} />
          {createCase.error ? (
            <p className="text-sm text-destructive">
              {createCase.error instanceof Error ? createCase.error.message : String(createCase.error)}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={createCase.isPending || uploadPhotos.isPending}>
              {createCase.isPending || uploadPhotos.isPending ? "Submitting…" : "Submit Report"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
