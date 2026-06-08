"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, MapPin, Tag, MessageSquare, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useJobPhotos } from "../hooks/useJobPhotos";
import { PhotoLightbox } from "./PhotoLightbox";
import type { JobPhoto } from "../types/photo.types";

interface CrewPhotoViewProps {
  projectId: string;
  projectName: string;
  projectAddress: string;
}

/**
 * Simplified mobile-optimised view for technician / crew role.
 * - Read-only on annotations (views annotated composite, cannot edit)
 * - Can upload progress/completion photos
 */
export function CrewPhotoView({
  projectId,
  projectName,
  projectAddress,
}: CrewPhotoViewProps) {
  const router = useRouter();
  const { data: photos = [], isLoading } = useJobPhotos(projectId, "all");
  const [lightboxPhoto, setLightboxPhoto] = useState<JobPhoto | null>(null);

  const annotatedPhotos = photos.filter((p) => p.hasAnnotations);
  const allPhotos = photos;

  return (
    <div className="flex flex-col gap-5 pb-24">
      {/* Job header */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
        <p className="text-lg font-semibold text-white">{projectName}</p>
        <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
          <MapPin className="h-3.5 w-3.5" />
          <span>{projectAddress}</span>
        </div>
      </div>

      {/* Annotated photos — primary crew reference */}
      {annotatedPhotos.length > 0 && (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Instructions / Marked Photos ({annotatedPhotos.length})
          </p>
          <div className="grid grid-cols-2 gap-3">
            {annotatedPhotos.map((photo) => (
              <CrewPhotoCard
                key={photo.id}
                photo={photo}
                onClick={() => setLightboxPhoto(photo)}
              />
            ))}
          </div>
        </section>
      )}

      {/* All photos */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          All Photos ({allPhotos.length})
        </p>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg bg-slate-800" />
            ))}
          </div>
        ) : allPhotos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-700 py-10">
            <Images className="h-8 w-8 text-slate-600" />
            <p className="text-sm text-slate-500">No photos yet for this job</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {allPhotos.map((photo) => (
              <CrewPhotoCard
                key={photo.id}
                photo={photo}
                onClick={() => setLightboxPhoto(photo)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Fixed upload button — sticky at bottom for quick field use */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-700 bg-[#1e1e1e] p-4">
        <Button
          className="w-full gap-2"
          size="lg"
          onClick={() => router.push(`/photos/jobs/${projectId}/upload`)}
        >
          <Camera className="h-5 w-5" />
          Upload Progress Photo
        </Button>
      </div>

      {/* Lightbox — read-only for crew */}
      {lightboxPhoto && (
        <PhotoLightbox
          photo={lightboxPhoto}
          photos={allPhotos}
          onClose={() => setLightboxPhoto(null)}
          onNavigate={setLightboxPhoto}
          canAnnotate={false}
        />
      )}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function CrewPhotoCard({
  photo,
  onClick,
}: {
  photo: JobPhoto;
  onClick: () => void;
}) {
  const displayUrl = photo.annotatedUrl ?? photo.publicUrl;

  return (
    <button
      className="group relative aspect-square overflow-hidden rounded-xl border border-slate-700 bg-slate-800"
      onClick={onClick}
    >
      {displayUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl}
          alt=""
          className="h-full w-full object-cover transition-transform group-active:scale-95"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-600">
          <Camera className="h-8 w-8" />
        </div>
      )}

      {/* Info overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="flex flex-col gap-0.5">
          {photo.beforeAfter !== "none" && (
            <span
              className={cn(
                "inline-block w-fit rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                photo.beforeAfter === "before"
                  ? "bg-amber-500 text-white"
                  : "bg-brand-500 text-white",
              )}
            >
              {photo.beforeAfter}
            </span>
          )}
          {photo.tags.length > 0 && (
            <div className="flex items-center gap-1">
              <Tag className="h-2.5 w-2.5 text-slate-400" />
              <span className="truncate text-[10px] text-slate-300">
                {photo.tags.join(", ")}
              </span>
            </div>
          )}
          {photo.notes && (
            <div className="flex items-center gap-1">
              <MessageSquare className="h-2.5 w-2.5 text-slate-400" />
              <span className="truncate text-[10px] text-slate-300">{photo.notes}</span>
            </div>
          )}
          <span className="text-[9px] text-slate-500">{formatDate(photo.createdAt)}</span>
        </div>
      </div>

      {/* Annotated indicator */}
      {photo.hasAnnotations && (
        <div className="absolute right-2 top-2 rounded-full bg-brand-500 p-1">
          <MessageSquare className="h-2.5 w-2.5 text-white" />
        </div>
      )}
    </button>
  );
}
