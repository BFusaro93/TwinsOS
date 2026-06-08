"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Pencil, MapPin, Clock, User, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { JobPhoto } from "../types/photo.types";

interface PhotoLightboxProps {
  photo: JobPhoto;
  photos: JobPhoto[];           // full list for prev/next navigation
  onClose: () => void;
  onNavigate: (photo: JobPhoto) => void;
  canAnnotate?: boolean;
  onAnnotate?: (photoId: string) => void;
}

export function PhotoLightbox({
  photo,
  photos,
  onClose,
  onNavigate,
  canAnnotate,
  onAnnotate,
}: PhotoLightboxProps) {
  const currentIndex = photos.findIndex((p) => p.id === photo.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  // Active URL: show annotated composite if available, otherwise original
  const activeUrl = photo.annotatedUrl ?? photo.publicUrl;

  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(photos[currentIndex - 1]);
      if (e.key === "ArrowRight" && hasNext) onNavigate(photos[currentIndex + 1]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPrev, hasNext, currentIndex, photos, onClose, onNavigate]);

  const content = (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/90"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 flex h-full w-full max-w-6xl flex-col md:flex-row">
        {/* Main image */}
        <div className="relative flex flex-1 items-center justify-center p-4">
          {/* Prev */}
          {hasPrev && (
            <button
              className="absolute left-2 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              onClick={() => onNavigate(photos[currentIndex - 1])}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {/* Next */}
          {hasNext && (
            <button
              className="absolute right-2 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              onClick={() => onNavigate(photos[currentIndex + 1])}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {activeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeUrl}
              alt={photo.fileName}
              className="max-h-[80vh] max-w-full rounded-md object-contain shadow-2xl"
            />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center rounded-md bg-slate-800 text-slate-500">
              Loading…
            </div>
          )}

          {/* Annotated badge */}
          {photo.hasAnnotations && (
            <span className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-brand-500/90 px-3 py-1 text-xs font-medium text-white">
              Annotated
            </span>
          )}
        </div>

        {/* Sidebar info */}
        <div className="flex w-full flex-col gap-4 overflow-y-auto bg-[#1e1e1e] p-6 md:w-72">
          {/* Header */}
          <div className="flex items-start justify-between">
            <p className="text-sm font-semibold text-white">Photo Details</p>
            <button
              onClick={onClose}
              className="rounded-sm p-0.5 text-slate-400 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Before / After badge */}
          {photo.beforeAfter !== "none" && (
            <span
              className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                photo.beforeAfter === "before"
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-brand-500/20 text-brand-400"
              }`}
            >
              {photo.beforeAfter === "before" ? "Before" : "After"}
            </span>
          )}

          {/* Meta */}
          <div className="space-y-3 text-sm text-slate-300">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span>{photo.uploadedByName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span>{formatDate(photo.createdAt)}</span>
            </div>
            {photo.gpsLat != null && photo.gpsLng != null && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="font-mono text-xs">
                  {photo.gpsLat.toFixed(5)}, {photo.gpsLng.toFixed(5)}
                </span>
              </div>
            )}
            {photo.tags.length > 0 && (
              <div className="flex items-start gap-2">
                <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                <div className="flex flex-wrap gap-1">
                  {photo.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {photo.notes && (
              <p className="rounded-md bg-slate-800 p-3 text-xs leading-relaxed text-slate-300">
                {photo.notes}
              </p>
            )}
          </div>

          {/* Actions */}
          {canAnnotate && onAnnotate && (
            <Button
              size="sm"
              className="mt-auto gap-1.5"
              onClick={() => onAnnotate(photo.id)}
            >
              <Pencil className="h-3.5 w-3.5" />
              {photo.hasAnnotations ? "Edit Annotation" : "Annotate"}
            </Button>
          )}

          {/* Counter */}
          <p className="text-center text-xs text-slate-600">
            {currentIndex + 1} / {photos.length}
          </p>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
