"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Pencil, MapPin, Clock, User, Tag, Trash2, Film, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { useUpdatePhoto } from "../hooks/useJobPhotos";
import type { JobPhoto } from "../types/photo.types";

interface PhotoLightboxProps {
  photo: JobPhoto;
  photos: JobPhoto[];           // full list for prev/next navigation
  onClose: () => void;
  onNavigate: (photo: JobPhoto) => void;
  canAnnotate?: boolean;
  onAnnotate?: (photoId: string) => void;
  onDelete?: (photoId: string) => void;
  projectId?: string;
}

export function PhotoLightbox({
  photo,
  photos,
  onClose,
  onNavigate,
  canAnnotate,
  onAnnotate,
  onDelete,
  projectId,
}: PhotoLightboxProps) {
  const currentIndex = photos.findIndex((p) => p.id === photo.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({ displayName: "", beforeAfter: "none" as JobPhoto["beforeAfter"], notes: "", tags: "" });
  const { mutate: updatePhoto, isPending: savingMeta } = useUpdatePhoto(projectId ?? photo.photoJobId);

  function openMetaEdit() {
    setMetaForm({
      displayName: photo.displayName ?? "",
      beforeAfter: photo.beforeAfter,
      notes: photo.notes ?? "",
      tags: photo.tags.join(", "),
    });
    setEditingMeta(true);
  }

  function saveMetaEdit() {
    const tags = metaForm.tags.split(",").map((t) => t.trim()).filter(Boolean);
    updatePhoto(
      {
        id: photo.id,
        displayName: metaForm.displayName || null,
        beforeAfter: metaForm.beforeAfter,
        notes: metaForm.notes || null,
        tags,
      },
      {
        onSuccess: () => { toast.success("Photo updated"); setEditingMeta(false); },
        onError: () => toast.error("Failed to save"),
      },
    );
  }

  const isImage = photo.mimeType?.startsWith("image/") ?? true;
  const isVideo = photo.mimeType?.startsWith("video/");
  const ext = photo.fileName.split(".").pop()?.toUpperCase() ?? "FILE";

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

          {isImage && activeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeUrl}
              alt={photo.fileName}
              className="max-h-[80vh] max-w-full rounded-md object-contain shadow-2xl"
            />
          ) : isVideo ? (
            <video
              src={activeUrl}
              controls
              className="max-h-[80vh] max-w-full rounded-md shadow-2xl"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-xl bg-slate-800 px-12 py-16 shadow-2xl">
              <FileText className="h-16 w-16 text-slate-400" />
              <p className="text-sm font-medium text-slate-300">{photo.fileName}</p>
              {activeUrl && (
                <a
                  href={activeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
                >
                  Open / Download
                </a>
              )}
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
        <div className="flex w-full flex-col gap-4 overflow-y-auto bg-[#1e1e1e] p-5 md:w-72" style={{ maxHeight: "50vh" }} onTouchStart={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-start justify-between">
            <p className="text-sm font-semibold text-white">{photo.displayName ?? photo.fileName}</p>
            <button
              onClick={onClose}
              className="rounded-sm p-0.5 text-slate-400 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Edit metadata form */}
          {editingMeta ? (
            <div className="flex flex-col gap-3 rounded-lg border border-[#3a3a3a] bg-[#2a2a2a] p-3">
              <p className="text-xs font-semibold text-slate-300">Edit Details</p>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-400">Name / Label</label>
                <Input
                  className="h-7 border-[#3a3a3a] bg-[#1e1e1e] text-xs text-white placeholder:text-slate-500 focus-visible:ring-brand-500"
                  placeholder={photo.fileName}
                  value={metaForm.displayName}
                  onChange={(e) => setMetaForm((f) => ({ ...f, displayName: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-400">Before / After</label>
                <select
                  className="rounded-md border border-[#3a3a3a] bg-[#1e1e1e] px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  value={metaForm.beforeAfter}
                  onChange={(e) => setMetaForm((f) => ({ ...f, beforeAfter: e.target.value as JobPhoto["beforeAfter"] }))}
                >
                  <option value="none">None</option>
                  <option value="before">Before</option>
                  <option value="after">After</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-400">Tags (comma-separated)</label>
                <Input
                  className="h-7 border-[#3a3a3a] bg-[#1e1e1e] text-xs text-white placeholder:text-slate-500 focus-visible:ring-brand-500"
                  placeholder="e.g. lawn, front yard"
                  value={metaForm.tags}
                  onChange={(e) => setMetaForm((f) => ({ ...f, tags: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-400">Notes</label>
                <Textarea
                  className="resize-none border-[#3a3a3a] bg-[#1e1e1e] text-xs text-white placeholder:text-slate-500 focus-visible:ring-brand-500"
                  rows={3}
                  placeholder="Add a note…"
                  value={metaForm.notes}
                  onChange={(e) => setMetaForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 border-[#3a3a3a] text-xs text-slate-300 hover:bg-[#2a2a2a]" onClick={() => setEditingMeta(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="flex-1 gap-1 bg-white text-xs text-slate-900 hover:bg-slate-100" disabled={savingMeta} onClick={saveMetaEdit}>
                  <Check className="h-3 w-3" /> {savingMeta ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Before / After badge */}
              {photo.beforeAfter !== "none" && (
                <span
                  className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                    photo.beforeAfter === "before"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-emerald-600/20 text-emerald-400"
                  }`}
                >
                  {photo.beforeAfter === "before" ? "Before" : "After"}
                </span>
              )}

              {/* Meta */}
              <div className="space-y-3 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                  <span>{photo.uploadedByName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                  <span>{formatDate(photo.createdAt)}</span>
                </div>
                {photo.gpsLat != null && photo.gpsLng != null && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                    <span className="font-mono text-xs">
                      {photo.gpsLat.toFixed(5)}, {photo.gpsLng.toFixed(5)}
                    </span>
                  </div>
                )}
                {photo.tags.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
                    <div className="flex flex-wrap gap-1">
                      {photo.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-[#2a2a2a] px-2 py-0.5 text-xs text-slate-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {photo.notes && (
                  <p className="whitespace-pre-wrap rounded-md bg-[#2a2a2a] p-3 text-xs leading-relaxed text-slate-300">
                    {photo.notes}
                  </p>
                )}
              </div>

              {/* Edit details button — must sit inside a flex-col div to stretch full-width */}
              <div className="flex flex-col">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5 border-brand-500 text-xs text-brand-400 hover:bg-brand-500/10 hover:text-brand-300"
                  onClick={openMetaEdit}
                >
                  <Pencil className="h-3 w-3" /> Edit Details
                </Button>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="mt-auto flex flex-col gap-2">
            {canAnnotate && onAnnotate && isImage && (
              <Button
                size="sm"
                className="w-full gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
                onClick={() => onAnnotate(photo.id)}
              >
                <Pencil className="h-3.5 w-3.5" />
                {photo.hasAnnotations ? "Edit Annotation" : "Annotate"}
              </Button>
            )}

            {onDelete && !confirmDelete && (
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1.5 border-red-800 text-red-400 hover:bg-red-950 hover:text-red-300"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}

            {onDelete && confirmDelete && (
              <div className="rounded-md border border-red-800 bg-red-950/50 p-3">
                <p className="mb-2 text-xs text-red-300">Delete this file? This cannot be undone.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-1 bg-red-600 text-xs hover:bg-red-700"
                    onClick={() => { onDelete(photo.id); onClose(); }}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </div>

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
