"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, Images, Video, FileUp, X, CheckCircle2, AlertCircle, Loader2, Film, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { usePhotoUpload } from "../hooks/usePhotoUpload";
import { usePhotoAccess } from "../hooks/usePhotoAccess";
import { fileToDataUrl, getImageDimensions } from "../lib/imageCompression";
import {
  MAX_PHOTO_UPLOAD_BYTES,
  getEffectiveMimeType,
  getUploadFileKind,
  isAllowedUploadMimeType,
  isHeicMimeType,
  looksLikeICloudPlaceholder,
  withEffectiveMimeType,
} from "../lib/fileType";
import { PHOTO_TAGS } from "../types/photo.types";
import type { BeforeAfterFlag, UploadContext, PhotoUploadInput } from "../types/photo.types";

interface PhotoUploaderProps {
  projectId: string;
}

interface PendingFile {
  file: File;
  preview: string | null; // null for non-images
  fileType: "image" | "video" | "other";
  /** HEIC/HEIF — browsers other than Safari can't preview it; converted to JPEG at upload. */
  isHeic: boolean;
  /** Suspiciously small for an image — likely an iCloud proxy that was never downloaded. */
  suspectPlaceholder: boolean;
  displayName: string;
  beforeAfter: BeforeAfterFlag;
  tags: string[];
  notes: string;
}

/** Which picker a batch of files came from — each enforces its own kind. */
type PickerSource = "camera" | "photo" | "video" | "file";

const PICKER_ALLOWED_KIND: Record<PickerSource, PendingFile["fileType"] | null> = {
  camera: "image",
  photo: "image",
  video: "video",
  file: null, // Files picker: anything on the allowlist
};

const PICKER_REJECTION_REASON: Record<PickerSource, string> = {
  camera: "photos only",
  photo: "photos only",
  video: "videos only",
  file: "unsupported file type",
};

export function PhotoUploader({ projectId }: PhotoUploaderProps) {
  const router = useRouter();
  const { isCrew } = usePhotoAccess();
  const { upload, progress, uploading, reset } = usePhotoUpload(projectId);

  const [pending, setPending] = useState<PendingFile[]>([]);
  const [globalBeforeAfter, setGlobalBeforeAfter] = useState<BeforeAfterFlag>("none");
  const [globalTags, setGlobalTags] = useState<string[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef  = useRef<HTMLInputElement>(null);
  const videoInputRef  = useRef<HTMLInputElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  const uploadContext: UploadContext = isCrew ? "progress" : "site_documentation";

  const addFiles = useCallback(async (files: File[], source: PickerSource) => {
    if (!files.length) return;

    // Validate size/type up front so the user gets an immediate, specific
    // error instead of a generic Storage API rejection at upload time.
    // Limits must match the job-photos-* bucket config (see
    // lib/fileType.ts and the migration it references).
    //
    // Type checks use the EFFECTIVE MIME (extension fallback) — Chrome
    // reports iPhone .heic files as application/octet-stream on several
    // platforms, which used to be rejected while an empty type slipped by.
    // The per-picker `accept` attribute is only a hint to the OS dialog, so
    // the Library/Camera/Videos pickers enforce their kind here too.
    const accepted: File[] = [];
    const rejected: string[] = [];
    const requiredKind = PICKER_ALLOWED_KIND[source];
    for (const raw of files) {
      const effectiveType = getEffectiveMimeType(raw);
      if (raw.size > MAX_PHOTO_UPLOAD_BYTES) {
        rejected.push(`${raw.name} (too large — max ${MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024)}MB)`);
      } else if (!effectiveType || !isAllowedUploadMimeType(effectiveType)) {
        rejected.push(`${raw.name} (unsupported file type)`);
      } else if (requiredKind && getUploadFileKind(effectiveType) !== requiredKind) {
        rejected.push(`${raw.name} (${PICKER_REJECTION_REASON[source]})`);
      } else {
        accepted.push(withEffectiveMimeType(raw));
      }
    }
    setRejectedFiles(rejected);
    if (!accepted.length) return;

    const newPending = await Promise.all(
      accepted.map(async (file): Promise<PendingFile> => {
        const type = getUploadFileKind(file.type);
        const isHeic = isHeicMimeType(file.type);
        // Chrome/Firefox/Edge can't decode HEIC, so skip the (broken) preview;
        // the hook converts it to JPEG before upload.
        const preview = type === "image" && !isHeic ? await fileToDataUrl(file).catch(() => null) : null;
        const dims = type === "image" && !isHeic ? await getImageDimensions(file).catch(() => null) : null;
        return {
          file,
          preview,
          fileType: type,
          isHeic,
          suspectPlaceholder: type === "image" && looksLikeICloudPlaceholder(file, dims),
          displayName: "",
          beforeAfter: type !== "other" ? globalBeforeAfter : "none" as BeforeAfterFlag,
          tags: type !== "other" ? [...globalTags] : [],
          notes: "",
        };
      }),
    );
    setPending((prev) => [...prev, ...newPending]);
  }, [globalBeforeAfter, globalTags]);

  function handleInput(ref: React.RefObject<HTMLInputElement | null>, source: PickerSource) {
    return async (e: React.ChangeEvent<HTMLInputElement>) => {
      await addFiles(Array.from(e.target.files ?? []), source);
      if (ref.current) ref.current.value = "";
    };
  }

  function removePending(index: number) {
    setPending((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePending(index: number, patch: Partial<PendingFile>) {
    setPending((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function toggleTag(pendingIndex: number, tag: string) {
    setPending((prev) => prev.map((p, i) => {
      if (i !== pendingIndex) return p;
      const has = p.tags.includes(tag);
      return { ...p, tags: has ? p.tags.filter((t) => t !== tag) : [...p.tags, tag] };
    }));
  }

  async function handleSubmit() {
    if (pending.length === 0) return;
    const inputs: PhotoUploadInput[] = pending.map((p) => ({
      photoJobId: projectId,
      file: p.file,
      displayName: p.displayName || undefined,
      beforeAfter: p.beforeAfter,
      tags: p.tags,
      notes: p.notes || undefined,
      uploadContext,
    }));
    await upload(inputs);
  }

  const allDone = progress.length > 0 && progress.every((p) => p.status === "done");
  const fileCount = pending.length;

  if (allDone) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <CheckCircle2 className="h-12 w-12 text-brand-500" />
        <p className="text-lg font-semibold text-slate-900">
          {progress.length} file{progress.length > 1 ? "s" : ""} uploaded
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { reset(); setPending([]); }}>Upload More</Button>
          <Button onClick={() => router.push(`/photos/jobs/${projectId}`)}>View Gallery</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Four picker buttons */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-5 text-center transition-colors hover:border-brand-400 hover:bg-brand-50"
        >
          <Camera className="h-7 w-7 text-brand-500" />
          <span className="text-xs font-medium text-slate-700">Camera</span>
          <span className="text-[10px] text-slate-400">Take a photo</span>
        </button>
        <button
          onClick={() => photoInputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-5 text-center transition-colors hover:border-brand-400 hover:bg-brand-50"
        >
          <Images className="h-7 w-7 text-brand-500" />
          <span className="text-xs font-medium text-slate-700">Library</span>
          <span className="text-[10px] text-slate-400">Saved photos</span>
        </button>
        <button
          onClick={() => videoInputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-5 text-center transition-colors hover:border-brand-400 hover:bg-brand-50"
        >
          <Video className="h-7 w-7 text-slate-500" />
          <span className="text-xs font-medium text-slate-700">Videos</span>
          <span className="text-[10px] text-slate-400">MP4, MOV, etc.</span>
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-5 text-center transition-colors hover:border-brand-400 hover:bg-brand-50"
        >
          <FileUp className="h-7 w-7 text-slate-500" />
          <span className="text-xs font-medium text-slate-700">Files</span>
          <span className="text-[10px] text-slate-400">PDF, DOCX, etc.</span>
        </button>
      </div>

      {/* Hidden file inputs */}
      {/* capture="environment" opens the rear camera directly on Android/iOS */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleInput(cameraInputRef, "camera")} />
      {/* No capture — opens library/file picker on all platforms */}
      <input ref={photoInputRef}  type="file" accept="image/*" multiple className="hidden" onChange={handleInput(photoInputRef, "photo")} />
      <input ref={videoInputRef}  type="file" accept="video/*" multiple className="hidden" onChange={handleInput(videoInputRef, "video")} />
      <input ref={fileInputRef}   type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" multiple className="hidden" onChange={handleInput(fileInputRef, "file")} />

      {rejectedFiles.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Some files couldn&apos;t be added:</p>
            <ul className="mt-1 list-disc pl-4">
              {rejectedFiles.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Global defaults (images only) */}
      {pending.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Default tags</p>
          <BeforeAfterPicker value={globalBeforeAfter} onChange={setGlobalBeforeAfter} />
          <div className="mt-3">
            <Label className="mb-1.5 block text-xs text-slate-500">Tags</Label>
            <TagPicker selected={globalTags} onToggle={(tag) => setGlobalTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])} />
          </div>
        </div>
      )}

      {/* Per-file cards */}
      {pending.length > 0 && (
        <div className="space-y-3">
          {pending.map((p, i) => {
            const prog = progress[i];
            const isImage = p.fileType === "image";
            return (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex gap-3">
                  {/* Preview / icon */}
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {isImage && p.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.preview} alt="" className="h-full w-full object-cover" />
                    ) : isImage && p.isHeic ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1" title="HEIC preview isn't available in this browser — it will be converted to JPEG on upload">
                        <Images className="h-7 w-7 text-slate-400" />
                        <span className="text-[10px] text-slate-400">HEIC</span>
                      </div>
                    ) : p.fileType === "video" ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                        <Film className="h-7 w-7 text-slate-400" />
                        <span className="text-[10px] text-slate-400">Video</span>
                      </div>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                        <FileText className="h-7 w-7 text-slate-400" />
                        <span className="text-[10px] text-slate-400">{p.file.name.split(".").pop()?.toUpperCase()}</span>
                      </div>
                    )}
                    {!prog && (
                      <button className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white" onClick={() => removePending(i)}>
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    {prog && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        {prog.status === "done" ? <CheckCircle2 className="h-6 w-6 text-brand-400" /> :
                         prog.status === "error" ? <AlertCircle className="h-6 w-6 text-red-400" /> :
                         <Loader2 className="h-6 w-6 animate-spin text-white" />}
                      </div>
                    )}
                  </div>

                  {/* Fields */}
                  <div className="flex-1 space-y-2">
                    <p className="truncate text-[10px] text-slate-400">{p.file.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {p.fileType === "image" ? "Photo" : p.fileType === "video" ? "Video" : "File"} ·{" "}
                      {(p.file.size / 1024).toFixed(0)} KB
                    </p>
                    {p.isHeic && (
                      <p className="text-[10px] text-slate-500">
                        HEIC — will be converted to JPEG on upload (preview not available in this browser).
                      </p>
                    )}
                    {/* Warn if iOS gave us an iCloud proxy: only for genuinely tiny files or an
                        implausibly low bytes-per-pixel ratio (see looksLikeICloudPlaceholder). */}
                    {p.suspectPlaceholder && (
                      <p className="text-[10px] font-medium text-amber-600">
                        ⚠️ This photo may not be fully downloaded from iCloud. Open it in your Photos app first, then re-add it.
                      </p>
                    )}

                    {!prog && (
                      <input
                        type="text"
                        placeholder="Display name (optional)"
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400"
                        value={p.displayName}
                        onChange={(e) => updatePending(i, { displayName: e.target.value })}
                      />
                    )}

                    {!prog && p.fileType !== "other" && (
                      <>
                        <BeforeAfterPicker value={p.beforeAfter} onChange={(v) => updatePending(i, { beforeAfter: v })} />
                        <TagPicker selected={p.tags} onToggle={(tag) => toggleTag(i, tag)} />
                      </>
                    )}

                    {!prog && (
                      <Textarea
                        placeholder="Optional note…"
                        rows={1}
                        className="resize-none border-slate-200 text-xs"
                        value={p.notes}
                        onChange={(e) => updatePending(i, { notes: e.target.value })}
                      />
                    )}

                    {prog && prog.status !== "done" && (
                      <p className="text-xs capitalize text-slate-400">
                        {prog.status === "error" ? `Error: ${prog.errorMessage}` : prog.status}…
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pending.length > 0 && !uploading && !allDone && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setPending([])}>Clear All</Button>
          <Button onClick={handleSubmit} className="flex-1 gap-1.5">
            <FileUp className="h-4 w-4" />
            Upload {fileCount} File{fileCount > 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function BeforeAfterPicker({ value, onChange }: { value: BeforeAfterFlag; onChange: (v: BeforeAfterFlag) => void }) {
  const opts: { value: BeforeAfterFlag; label: string }[] = [
    { value: "none",   label: "Neither" },
    { value: "before", label: "Before" },
    { value: "during", label: "During" },
    { value: "after",  label: "After" },
  ];
  return (
    <div className="flex items-center gap-1">
      {opts.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
            value === o.value
              ? o.value === "before" ? "bg-amber-500 text-white"
                : o.value === "during" ? "bg-slate-500 text-white"
                : o.value === "after" ? "bg-brand-500 text-white"
                : "bg-slate-600 text-white"
              : "bg-slate-100 text-slate-500 hover:text-slate-700")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TagPicker({ selected, onToggle }: { selected: string[]; onToggle: (tag: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {PHOTO_TAGS.map((tag) => (
        <button key={tag} onClick={() => onToggle(tag)}
          className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
            selected.includes(tag)
              ? "bg-brand-500/20 text-brand-700 ring-1 ring-brand-400"
              : "bg-slate-100 text-slate-500 hover:text-slate-700")}>
          {tag}
        </button>
      ))}
    </div>
  );
}
