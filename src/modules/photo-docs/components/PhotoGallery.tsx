"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Pencil, SlidersHorizontal, Images, Film, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { useJobPhotos, useDeletePhoto } from "../hooks/useJobPhotos";
import { usePhotoAccess } from "../hooks/usePhotoAccess";
import { PhotoLightbox } from "./PhotoLightbox";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import type { GalleryTab, GalleryFileType, JobPhoto } from "../types/photo.types";

interface PhotoGalleryProps {
  projectId: string;
}

const TABS: { value: GalleryTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "before", label: "Before" },
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

  const { data: allPhotos = [], isLoading } = useJobPhotos(projectId, tab);
  const { mutate: deletePhoto } = useDeletePhoto(projectId);

  // Client-side file type filter
  const photos = allPhotos.filter((p) => {
    if (fileType === "photos")    return p.mimeType?.startsWith("image/") ?? true;
    if (fileType === "videos")    return p.mimeType?.startsWith("video/");
    if (fileType === "documents") return !p.mimeType?.startsWith("image/") && !p.mimeType?.startsWith("video/");
    return true;
  });

  const beforePhotos = photos.filter((p) => p.beforeAfter === "before");
  const afterPhotos = photos.filter((p) => p.beforeAfter === "after");
  const hasBeforeAfterPairs = beforePhotos.length > 0 && afterPhotos.length > 0;

  function handleAnnotate(photoId: string) {
    router.push(`/photos/jobs/${projectId}/${photoId}/annotate`);
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
                  ? "bg-brand-500 text-white"
                  : "border border-slate-600 text-slate-400 hover:text-slate-200",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Before/After tabs */}
        <div className="flex items-center rounded-md border border-slate-700 bg-slate-800 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.value
                  ? "bg-brand-500 text-white"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {hasBeforeAfterPairs && (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "gap-1.5 border-slate-600 text-xs",
                showBeforeAfter && "border-brand-500 text-brand-400",
              )}
              onClick={() => setShowBeforeAfter((v) => !v)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Before / After
            </Button>
          )}
          {canUpload && (
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => router.push(`/photos/jobs/${projectId}/upload`)}
            >
              <Camera className="h-3.5 w-3.5" />
              Upload Files
            </Button>
          )}
        </div>
      </div>

      {/* Before/After slider mode */}
      {showBeforeAfter && hasBeforeAfterPairs && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Before / After Comparison
          </p>
          <BeforeAfterSlider
            beforePhotos={beforePhotos}
            afterPhotos={afterPhotos}
          />
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg bg-slate-800" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-700 py-16 text-center">
          <Images className="h-10 w-10 text-slate-600" />
          <div>
            <p className="text-sm font-medium text-slate-300">No photos yet</p>
            <p className="text-xs text-slate-500">
              {tab === "all"
                ? "Upload the first photo for this job"
                : `No ${tab} photos`}
            </p>
          </div>
          {canUpload && tab === "all" && (
            <Button
              size="sm"
              className="gap-1.5 text-xs"
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
              onClick={() => setLightboxPhoto(photo)}
              canAnnotate={canAnnotate}
              onAnnotate={handleAnnotate}
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <PhotoLightbox
          photo={lightboxPhoto}
          photos={photos}
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
}: {
  photo: JobPhoto;
  onClick: () => void;
  canAnnotate?: boolean;
  onAnnotate?: (id: string) => void;
}) {
  const displayUrl = photo.annotatedUrl ?? photo.publicUrl;
  const isImage = photo.mimeType?.startsWith("image/") ?? true;
  const isVideo = photo.mimeType?.startsWith("video/");
  const ext = photo.fileName.split(".").pop()?.toUpperCase() ?? "FILE";

  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
      {/* Thumbnail */}
      <button className="h-full w-full" onClick={onClick}>
        {isImage && displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt={photo.fileName}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : isVideo ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-900">
            <Film className="h-10 w-10 text-slate-400" />
            <span className="text-[10px] font-medium text-slate-400">{ext}</span>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-900">
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
                  "inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                  photo.beforeAfter === "before"
                    ? "bg-amber-500 text-white"
                    : "bg-brand-500 text-white",
                )}
              >
                {photo.beforeAfter}
              </span>
            )}
            <span className="text-[10px] text-slate-300">
              {formatDate(photo.createdAt)}
            </span>
          </div>
          {photo.hasAnnotations && (
            <Pencil className="h-3 w-3 shrink-0 text-brand-400" />
          )}
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
