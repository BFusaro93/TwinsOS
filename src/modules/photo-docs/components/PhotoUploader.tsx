"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { usePhotoUpload } from "../hooks/usePhotoUpload";
import { usePhotoAccess } from "../hooks/usePhotoAccess";
import { fileToDataUrl } from "../lib/imageCompression";
import { PHOTO_TAGS } from "../types/photo.types";
import type { BeforeAfterFlag, UploadContext, PhotoUploadInput } from "../types/photo.types";

interface PhotoUploaderProps {
  projectId: string;
}

interface PendingFile {
  file: File;
  preview: string;
  beforeAfter: BeforeAfterFlag;
  tags: string[];
  notes: string;
}

export function PhotoUploader({ projectId }: PhotoUploaderProps) {
  const router = useRouter();
  const { isCrew } = usePhotoAccess();
  const { upload, progress, uploading, reset } = usePhotoUpload(projectId);

  const [pending, setPending] = useState<PendingFile[]>([]);
  const [globalBeforeAfter, setGlobalBeforeAfter] = useState<BeforeAfterFlag>("none");
  const [globalTags, setGlobalTags] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadContext: UploadContext = isCrew ? "progress" : "site_documentation";

  // Pick files via input (supports camera on mobile)
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (!files.length) return;
      const newPending = await Promise.all(
        files.map(async (file) => ({
          file,
          preview: await fileToDataUrl(file),
          beforeAfter: globalBeforeAfter,
          tags: [...globalTags],
          notes: "",
        })),
      );
      setPending((prev) => [...prev, ...newPending]);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [globalBeforeAfter, globalTags],
  );

  function removePending(index: number) {
    setPending((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePending(index: number, patch: Partial<PendingFile>) {
    setPending((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );
  }

  function toggleTag(pendingIndex: number, tag: string) {
    setPending((prev) =>
      prev.map((p, i) => {
        if (i !== pendingIndex) return p;
        const has = p.tags.includes(tag);
        return {
          ...p,
          tags: has ? p.tags.filter((t) => t !== tag) : [...p.tags, tag],
        };
      }),
    );
  }

  async function handleSubmit() {
    if (pending.length === 0) return;
    const inputs: PhotoUploadInput[] = pending.map((p) => ({
      photoJobId: projectId,
      file: p.file,
      beforeAfter: p.beforeAfter,
      tags: p.tags,
      notes: p.notes || undefined,
      uploadContext,
    }));
    await upload(inputs);
  }

  const allDone = progress.length > 0 && progress.every((p) => p.status === "done");

  if (allDone) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <CheckCircle2 className="h-12 w-12 text-brand-500" />
        <p className="text-lg font-semibold text-white">
          {progress.length} photo{progress.length > 1 ? "s" : ""} uploaded
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              setPending([]);
            }}
          >
            Upload More
          </Button>
          <Button onClick={() => router.push(`/photos/jobs/${projectId}`)}>
            View Gallery
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Drop zone / file picker */}
      <div
        className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-600 py-10 text-center transition-colors hover:border-brand-500 hover:bg-brand-500/5"
        onClick={() => fileInputRef.current?.click()}
      >
        <Camera className="h-10 w-10 text-slate-500" />
        <div>
          <p className="font-medium text-slate-200">Tap to select photos</p>
          <p className="text-xs text-slate-500">
            Camera or photo library · Compressed automatically · Max 500 KB/photo
          </p>
        </div>
        {/* capture="environment" opens rear camera on mobile */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Global tag/flag shortcuts for batch apply */}
      {pending.length === 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Default for all photos
          </p>
          <BeforeAfterPicker
            value={globalBeforeAfter}
            onChange={setGlobalBeforeAfter}
          />
          <div className="mt-3">
            <Label className="mb-1.5 block text-xs text-slate-400">Tags</Label>
            <TagPicker
              selected={globalTags}
              onToggle={(tag) =>
                setGlobalTags((prev) =>
                  prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                )
              }
            />
          </div>
        </div>
      )}

      {/* Per-photo cards */}
      {pending.length > 0 && (
        <div className="space-y-4">
          {pending.map((p, i) => {
            const prog = progress[i];
            return (
              <div
                key={i}
                className="rounded-xl border border-slate-700 bg-slate-800 p-4"
              >
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.preview}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    {!prog && (
                      <button
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                        onClick={() => removePending(i)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {prog && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        {prog.status === "done" ? (
                          <CheckCircle2 className="h-6 w-6 text-brand-400" />
                        ) : prog.status === "error" ? (
                          <AlertCircle className="h-6 w-6 text-red-400" />
                        ) : (
                          <Loader2 className="h-6 w-6 animate-spin text-white" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Fields */}
                  <div className="flex-1 space-y-3">
                    <p className="truncate text-xs text-slate-400">{p.file.name}</p>

                    {!prog && (
                      <>
                        <BeforeAfterPicker
                          value={p.beforeAfter}
                          onChange={(v) => updatePending(i, { beforeAfter: v })}
                        />
                        <TagPicker
                          selected={p.tags}
                          onToggle={(tag) => toggleTag(i, tag)}
                        />
                        <Textarea
                          placeholder="Optional note (e.g. 'remove this tree')"
                          rows={2}
                          className="resize-none border-slate-600 bg-slate-700 text-xs text-slate-200 placeholder:text-slate-500"
                          value={p.notes}
                          onChange={(e) => updatePending(i, { notes: e.target.value })}
                        />
                      </>
                    )}

                    {prog && (
                      <p className="text-xs capitalize text-slate-400">
                        {prog.status === "error"
                          ? `Error: ${prog.errorMessage}`
                          : prog.status}
                        …
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit */}
      {pending.length > 0 && !uploading && !allDone && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setPending([])}
            className="border-slate-600"
          >
            Clear All
          </Button>
          <Button onClick={handleSubmit} className="flex-1 gap-1.5">
            <Upload className="h-4 w-4" />
            Upload {pending.length} Photo{pending.length > 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function BeforeAfterPicker({
  value,
  onChange,
}: {
  value: BeforeAfterFlag;
  onChange: (v: BeforeAfterFlag) => void;
}) {
  const opts: { value: BeforeAfterFlag; label: string }[] = [
    { value: "none", label: "Neither" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
  ];
  return (
    <div className="flex items-center gap-1">
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === o.value
              ? o.value === "before"
                ? "bg-amber-500 text-white"
                : o.value === "after"
                  ? "bg-brand-500 text-white"
                  : "bg-slate-600 text-white"
              : "bg-slate-700 text-slate-400 hover:text-slate-200",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TagPicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PHOTO_TAGS.map((tag) => (
        <button
          key={tag}
          onClick={() => onToggle(tag)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            selected.includes(tag)
              ? "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500"
              : "bg-slate-700 text-slate-400 hover:text-slate-200",
          )}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
