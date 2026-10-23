"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { convertHeicToJpeg, isHeicMimeType, withEffectiveMimeType } from "@/modules/photo-docs/lib/fileType";

interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

/** Holds photos chosen before a damage case exists; upload them after create. */
export function useDamagePhotos() {
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<PendingPhoto[]>([]);
  ref.current = photos;

  // Release object URLs when the owning form unmounts.
  useEffect(() => () => ref.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const added: PendingPhoto[] = [];
    for (const raw of Array.from(list)) {
      let file = withEffectiveMimeType(raw);
      if (!file.type.startsWith("image/")) {
        setError(`${raw.name} is not an image`);
        continue;
      }
      // Only Safari can render HEIC, so convert before it is stored.
      if (isHeicMimeType(file.type)) {
        try {
          file = await convertHeicToJpeg(file);
        } catch {
          setError(`Could not read ${raw.name} — try a JPEG`);
          continue;
        }
      }
      added.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) });
    }
    setPhotos((prev) => [...prev, ...added]);
  }

  function remove(id: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function clear() {
    ref.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setError(null);
  }

  return { photos, files: photos.map((p) => p.file), error, addFiles, remove, clear };
}

export function DamagePhotoPicker({ state }: { state: ReturnType<typeof useDamagePhotos> }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <Label>Photos <span className="text-xs text-muted-foreground">(optional)</span></Label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()}>
          <Camera className="mr-1.5 h-4 w-4" />Take Photo
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => libraryRef.current?.click()}>
          <ImagePlus className="mr-1.5 h-4 w-4" />Upload from Library
        </Button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { void state.addFiles(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => { void state.addFiles(e.target.files); e.target.value = ""; }}
      />
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {state.photos.map((p) => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-md border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl} alt={p.file.name} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`Remove ${p.file.name}`}
                onClick={() => state.remove(p.id)}
                className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
