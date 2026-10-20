"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateDamageCase } from "@/lib/hooks/use-damage-cases";
import { useUploadAttachment } from "@/lib/hooks/use-attachments";
import { convertHeicToJpeg, isHeicMimeType, withEffectiveMimeType } from "@/modules/photo-docs/lib/fileType";
import { DamageClientPicker } from "@/components/damage-cases/DamageClientPicker";
import type { DamageCaseType } from "@/types";

interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

/** Field "Damage Report" — submitting opens a new Damage Case. */
export function DamageReportForm() {
  const createCase = useCreateDamageCase();
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [caseType, setCaseType] = useState<DamageCaseType>("damage");
  const [customerName, setCustomerName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [dateOfIncident, setDateOfIncident] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const uploadPhotos = useUploadAttachment("damage_case", "");
  const photosRef = useRef<PendingPhoto[]>([]);
  photosRef.current = photos;

  // Release object URLs when the form unmounts.
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setPhotoError(null);
    const added: PendingPhoto[] = [];
    for (const raw of Array.from(list)) {
      let file = withEffectiveMimeType(raw);
      if (!file.type.startsWith("image/")) {
        setPhotoError(`${raw.name} is not an image`);
        continue;
      }
      // Only Safari can render HEIC, so convert before it is stored.
      if (isHeicMimeType(file.type)) {
        try {
          file = await convertHeicToJpeg(file);
        } catch {
          setPhotoError(`Could not read ${raw.name} — try a JPEG`);
          continue;
        }
      }
      added.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) });
    }
    setPhotos((prev) => [...prev, ...added]);
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function reset() {
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setPhotoError(null);
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
              if (photos.length) {
                const results = await uploadPhotos.mutateAsync({ files: photos.map((p) => p.file), recordId: created.id });
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
          <div className="space-y-2">
            <Label>Photos <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
                <Camera className="mr-1.5 h-4 w-4" />Take Photo
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => libraryInputRef.current?.click()}>
                <ImagePlus className="mr-1.5 h-4 w-4" />Upload from Library
              </Button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }}
            />
            <input
              ref={libraryInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="hidden"
              onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }}
            />
            {photoError ? <p className="text-sm text-destructive">{photoError}</p> : null}
            {photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p) => (
                  <div key={p.id} className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.previewUrl} alt={p.file.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label={`Remove ${p.file.name}`}
                      onClick={() => removePhoto(p.id)}
                      className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
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
