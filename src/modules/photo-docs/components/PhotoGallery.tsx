"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckSquare, MessageSquare, Pencil, SlidersHorizontal, Images, Film, FileText, X, ArrowLeftRight, Trash2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { useJobPhotos, useDeletePhoto, useBulkUpdatePhotos } from "../hooks/useJobPhotos";
import { useJobPhotoComparisons, useCreatePhotoComparison, useDeletePhotoComparison } from "../hooks/usePhotoComparisons";
import { usePhotoAccess } from "../hooks/usePhotoAccess";
import { PhotoLightbox } from "./PhotoLightbox";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import type { GalleryTab, GalleryFileType, JobPhoto, BeforeAfterFlag } from "../types/photo.types";

interface PhotoGalleryProps {
  projectId: string;
}

const TABS: { value: GalleryTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "before", label: "Before" },
  { value: "during", label: "During" },
  { value: "after", label: "After" },
  { value: "annotated", label: "Annotated" },
];

const FILE_TYPE_FILTERS: { value: GalleryFileType; label: string }[] = [
  { value: "all",       label: "All" },
  { value: "photos",    label: "Photos" },
  { value: "videos",    label: "Videos" },
  { value: "documents", label: "Docs" },
];

export function PhotoGallery({ projectId }: PhotoGalleryProps) {
  const router = useRouter();
  const { canUpload, canAnnotate } = usePhotoAccess();
  const [tab, setTab] = useState<GalleryTab>("all");
  const [fileType, setFileType] = useState<GalleryFileType>("all");
  const [lightboxPhoto, setLightboxPhoto] = useState<JobPhoto | null>(null);
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const [openComparisonId, setOpenComparisonId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pairDialogOpen, setPairDialogOpen] = useState(false);
  const [pairSwapped, setPairSwapped] = useState(false);
  const [pairLabel, setPairLabel] = useState("");

  const { data: allPhotos = [], isLoading } = useJobPhotos(projectId, tab);
  const { mutate: deletePhoto } = useDeletePhoto(projectId);
  const { mutate: bulkUpdate, isPending: isBulkPending } = useBulkUpdatePhotos(projectId);
  const { data: comparisons = [] } = useJobPhotoComparisons(projectId);
  const { mutate: createComparison, isPending: isCreatingComparison } = useCreatePhotoComparison(projectId);
  const { mutate: deleteComparison } = useDeletePhotoComparison(projectId);

  // Client-side file type filter
  const photos = allPhotos.filter((p) => {
    if (fileType === "photos")    return p.mimeType?.startsWith("image/") ?? true;
    if (fileType === "videos")    return p.mimeType?.startsWith("video/");
    if (fileType === "documents") return !p.mimeType?.startsWith("image/") && !p.mimeType?.startsWith("video/");
    return true;
  });

  const hasComparisons = comparisons.length > 0;
  const openComparison = comparisons.find((c) => c.id === openComparisonId) ?? null;
  const selectedPhotos = photos.filter((p) => selected.has(p.id));
  const canPair = selectedPhotos.length === 2;

  function handleAnnotate(photoId: string) {
    router.push(`/photos/jobs/${projectId}/${photoId}/annotate`);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function handleBulkTag(flag: BeforeAfterFlag) {
    if (selected.size === 0) return;
    bulkUpdate({ ids: Array.from(selected), beforeAfter: flag }, { onSuccess: exitSelectMode });
  }

  function openPairDialog() {
    setPairSwapped(false);
    setPairLabel("");
    setPairDialogOpen(true);
  }

  function handleCreateComparison() {
    if (!canPair) return;
    const [first, second] = selectedPhotos;
    const beforePhotoId = pairSwapped ? second.id : first.id;
    const afterPhotoId = pairSwapped ? first.id : second.id;
    createComparison(
      { beforePhotoId, afterPhotoId, label: pairLabel.trim() || null },
      {
        onSuccess: () => {
          setPairDialogOpen(false);
          exitSelectMode();
          setShowBeforeAfter(true);
        },
      }
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* File type filter */}
        <div className="flex items-center gap-1">
          {FILE_TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFileType(f.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                fileType === f.value
                  ? "bg-[#2a2a2a] text-white"
                  : "border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Before/After tabs */}
        <div className="flex items-center rounded-md border border-slate-200 bg-slate-100 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.value
                  ? "bg-[#2a2a2a] text-white"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {hasComparisons && !selectMode && (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "gap-1.5 text-xs",
                showBeforeAfter ? "border-[#2a2a2a] bg-[#2a2a2a] text-white" : "border-slate-200 text-slate-600",
              )}
              onClick={() => { setShowBeforeAfter((v) => !v); setOpenComparisonId(null); }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Before / After
            </Button>
          )}
          {canUpload && (
            <Button
              size="sm"
              variant="outline"
              className={cn(
                "gap-1.5 text-xs",
                selectMode
                  ? "border-brand-600 bg-brand-600 text-white hover:bg-brand-700 hover:text-white"
                  : "border-[#2a2a2a] bg-[#2a2a2a] text-white hover:bg-[#3a3a3a] hover:text-white",
              )}
              onClick={() => {
                if (selectMode) { exitSelectMode(); } else { setSelectMode(true); setShowBeforeAfter(false); }
              }}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {selectMode ? "Cancel" : "Select"}
            </Button>
          )}
          {!selectMode && canUpload && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-[#2a2a2a] bg-[#2a2a2a] text-xs text-white hover:bg-[#3a3a3a] hover:text-white"
              onClick={() => router.push(`/photos/jobs/${projectId}/upload`)}
            >
              <Camera className="h-3.5 w-3.5" />
              Upload Files
            </Button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5">
          <span className="text-xs font-medium text-slate-500">
            {selected.size === 0 ? "Select 2 photos to pair, or more to tag" : `${selected.size} selected`}
          </span>
          <div className="flex items-center gap-1.5">
            {(["before", "during", "after", "none"] as BeforeAfterFlag[]).map((flag) => (
              <button
                key={flag}
                disabled={selected.size === 0 || isBulkPending}
                onClick={() => handleBulkTag(flag)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-40",
                  flag === "before" ? "bg-amber-500 text-white hover:bg-amber-600"
                  : flag === "during" ? "bg-slate-500 text-white hover:bg-slate-600"
                  : flag === "after"  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-slate-600 text-white hover:bg-slate-700",
                )}
              >
                {flag === "none" ? "Clear tag" : flag.charAt(0).toUpperCase() + flag.slice(1)}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-slate-300" />
            <button
              disabled={!canPair}
              onClick={openPairDialog}
              title={canPair ? undefined : "Select exactly 2 photos to pair"}
              className="flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
            >
              <SlidersHorizontal className="h-3 w-3" />
              Pair as Before/After
            </button>
          </div>
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Before/After comparisons */}
      {showBeforeAfter && hasComparisons && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          {openComparison && openComparison.beforePhoto && openComparison.afterPhoto ? (
            <>
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={() => setOpenComparisonId(null)}
                  className="flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  All Comparisons
                </button>
                <span className="text-xs text-slate-300">/</span>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {openComparison.label || "Comparison"}
                </p>
              </div>
              <BeforeAfterSlider before={openComparison.beforePhoto} after={openComparison.afterPhoto} />
            </>
          ) : (
            <>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Before / After Comparisons
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {comparisons.map((c) => (
                  <div
                    key={c.id}
                    className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white"
                  >
                    <button
                      className="grid aspect-[2/1] w-full grid-cols-2 gap-px overflow-hidden bg-slate-100"
                      onClick={() => setOpenComparisonId(c.id)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.beforePhoto?.annotatedUrl ?? c.beforePhoto?.publicUrl}
                        alt="Before"
                        className="h-full w-full object-cover"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.afterPhoto?.annotatedUrl ?? c.afterPhoto?.publicUrl}
                        alt="After"
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="truncate text-xs font-medium text-slate-700">
                        {c.label || "Comparison"}
                      </span>
                      <button
                        onClick={() => deleteComparison(c.id)}
                        className="shrink-0 text-slate-300 hover:text-red-500"
                        title="Delete comparison"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Create comparison dialog */}
      <Dialog open={pairDialogOpen} onOpenChange={setPairDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pair as Before/After</DialogTitle>
            <DialogDescription>Choose which selected photo is "before" and which is "after".</DialogDescription>
          </DialogHeader>
          {selectedPhotos.length === 2 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                {(pairSwapped ? [selectedPhotos[1], selectedPhotos[0]] : selectedPhotos).map((photo, i) => (
                  <div key={photo.id} className="flex-1 space-y-1">
                    <div className="aspect-square overflow-hidden rounded-lg border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.annotatedUrl ?? photo.publicUrl}
                        alt={i === 0 ? "Before" : "After"}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <p className={cn(
                      "text-center text-xs font-semibold uppercase",
                      i === 0 ? "text-amber-500" : "text-emerald-600",
                    )}>
                      {i === 0 ? "Before" : "After"}
                    </p>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setPairSwapped((v) => !v)}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Swap Before/After
              </Button>
              <div className="grid gap-1.5">
                <Label htmlFor="pair-label">Label (optional)</Label>
                <Input
                  id="pair-label"
                  placeholder="e.g. Front bed, Retaining wall"
                  value={pairLabel}
                  onChange={(e) => setPairLabel(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPairDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={isCreatingComparison} onClick={handleCreateComparison}>
              {isCreatingComparison ? "Creating..." : "Create Comparison"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg bg-slate-800" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 py-16 text-center">
          {fileType === "videos" ? (
            <Film className="h-10 w-10 text-slate-300" />
          ) : fileType === "documents" ? (
            <FileText className="h-10 w-10 text-slate-300" />
          ) : (
            <Images className="h-10 w-10 text-slate-300" />
          )}
          <div>
            <p className="text-sm font-medium text-slate-500">
              {fileType === "videos"
                ? "No videos yet"
                : fileType === "documents"
                ? "No documents yet"
                : "No photos yet"}
            </p>
            <p className="text-xs text-slate-400">
              {tab === "all" && fileType === "all"
                ? "Upload the first photo for this job"
                : tab !== "all"
                ? `No ${tab} ${fileType === "videos" ? "videos" : fileType === "documents" ? "documents" : "photos"}`
                : `No ${fileType} uploaded yet`}
            </p>
          </div>
          {canUpload && tab === "all" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-[#2a2a2a] bg-[#2a2a2a] text-xs text-white hover:bg-[#3a3a3a] hover:text-white"
              onClick={() => router.push(`/photos/jobs/${projectId}/upload`)}
            >
              <Camera className="h-3.5 w-3.5" />
              Upload Files
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <PhotoThumbnail
              key={photo.id}
              photo={photo}
              onClick={() => selectMode ? toggleSelect(photo.id) : setLightboxPhoto(photo)}
              canAnnotate={!selectMode && canAnnotate}
              onAnnotate={handleAnnotate}
              selectMode={selectMode}
              isSelected={selected.has(photo.id)}
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <PhotoLightbox
          photo={lightboxPhoto}
          photos={photos}
          projectId={projectId}
          onClose={() => setLightboxPhoto(null)}
          onNavigate={setLightboxPhoto}
          canAnnotate={canAnnotate}
          onAnnotate={handleAnnotate}
          onDelete={(id) => { deletePhoto(id); setLightboxPhoto(null); }}
        />
      )}
    </div>
  );
}

// ── Photo thumbnail card ──────────────────────────────────────────────────────

function PhotoThumbnail({
  photo,
  onClick,
  canAnnotate,
  onAnnotate,
  selectMode,
  isSelected,
}: {
  photo: JobPhoto;
  onClick: () => void;
  canAnnotate?: boolean;
  onAnnotate?: (id: string) => void;
  selectMode?: boolean;
  isSelected?: boolean;
}) {
  const displayUrl = photo.annotatedUrl ?? photo.publicUrl;
  const isImage = photo.mimeType?.startsWith("image/") ?? true;
  const isVideo = photo.mimeType?.startsWith("video/");
  const ext = photo.fileName.split(".").pop()?.toUpperCase() ?? "FILE";

  return (
    <div className={cn(
      "group relative aspect-square overflow-hidden rounded-lg border bg-slate-100 transition-all",
      isSelected ? "border-brand-500 ring-2 ring-brand-500" : "border-slate-200",
    )}>
      {/* Select mode checkbox */}
      {selectMode && (
        <div className={cn(
          "pointer-events-none absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
          isSelected ? "border-brand-500 bg-brand-500" : "border-white bg-black/30",
        )}>
          {isSelected && <span className="text-[10px] font-bold text-white">✓</span>}
        </div>
      )}

      {/* Thumbnail */}
      <button className="h-full w-full" onClick={onClick}>
        {isImage && displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt={photo.fileName}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            onError={(e) => {
              // Hide broken image and show fallback placeholder
              (e.currentTarget as HTMLImageElement).style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent && !parent.querySelector("[data-img-error]")) {
                const fb = document.createElement("div");
                fb.setAttribute("data-img-error", "1");
                fb.className = "flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-200";
                fb.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg><span style="font-size:10px;color:#94a3b8;">Failed to load</span>`;
                parent.appendChild(fb);
              }
            }}
          />
        ) : isVideo ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100">
            <Film className="h-10 w-10 text-slate-400" />
            <span className="text-[10px] font-medium text-slate-400">{ext}</span>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100">
            <FileText className="h-10 w-10 text-slate-400" />
            <span className="text-[10px] font-medium text-slate-400">{ext}</span>
          </div>
        )}
      </button>

      {/* Overlay badges */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="flex items-end justify-between gap-1">
          <div className="flex flex-col gap-0.5">
            {photo.displayName && (
              <span className="truncate text-[10px] font-semibold text-white">{photo.displayName}</span>
            )}
            {photo.beforeAfter !== "none" && (
              <span
                className={cn(
                  "self-start rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                  photo.beforeAfter === "before"
                    ? "bg-amber-500 text-white"
                    : photo.beforeAfter === "during"
                    ? "bg-slate-500 text-white"
                    : "bg-emerald-600 text-white",
                )}
              >
                {photo.beforeAfter}
              </span>
            )}
            <span className="text-[10px] text-slate-300">
              {formatDate(photo.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {photo.notes && (
              <MessageSquare className="h-5 w-5 shrink-0 text-brand-500" />
            )}
            {photo.hasAnnotations && (
              <Pencil className="h-3 w-3 shrink-0 text-brand-400" />
            )}
          </div>
        </div>
      </div>

      {/* Annotate button on hover */}
      {canAnnotate && onAnnotate && (
        <button
          className="pointer-events-auto absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onAnnotate(photo.id);
          }}
          title="Annotate"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Tags (first tag only) */}
      {photo.tags.length > 0 && (
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-slate-200">
          {photo.tags[0]}
          {photo.tags.length > 1 && ` +${photo.tags.length - 1}`}
        </span>
      )}
    </div>
  );
}
