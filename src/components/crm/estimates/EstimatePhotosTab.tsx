"use client";

import { useState } from "react";
import {
  useEstimatePhotos,
  useUploadEstimatePhoto,
  useUpdateEstimatePhotoCaption,
  useUpdateEstimatePhotoVisibility,
  useDeleteEstimatePhoto,
  type EstimatePhoto,
} from "@/lib/hooks/use-estimate-photos";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Camera, ImagePlus, Trash2, Eye, EyeOff } from "lucide-react";

interface Props {
  estimateId: string;
}

export function EstimatePhotosTab({ estimateId }: Props) {
  const { data: photos = [], isLoading } = useEstimatePhotos(estimateId);
  const upload = useUploadEstimatePhoto(estimateId);
  const updateCaption = useUpdateEstimatePhotoCaption(estimateId);
  const updateVisibility = useUpdateEstimatePhotoVisibility(estimateId);
  const remove = useDeleteEstimatePhoto(estimateId);
  const [dragging, setDragging] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<EstimatePhoto | null>(null);

  async function handleFiles(files: FileList | File[]) {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const skipped = Array.from(files).length - images.length;
    if (skipped > 0) toast.error(`${skipped} non-image file(s) skipped`);
    if (!images.length) return;
    const results = await upload.mutateAsync(images);
    const failed = results.filter((r) => !r.ok);
    if (failed.length) toast.error(`${failed.length} photo(s) failed to upload`);
    else toast.success(`${images.length} photo(s) uploaded`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragging(false);
          await handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          dragging
            ? "border-brand-400 bg-brand-50"
            : "border-slate-200 bg-white hover:border-slate-300"
        )}
      >
        <Camera className={cn("mx-auto h-8 w-8 mb-3", dragging ? "text-brand-400" : "text-slate-300")} />
        <p className="text-sm font-medium text-slate-600 mb-1">
          {dragging ? "Drop photos here" : "Drag & drop photos here"}
        </p>
        <p className="text-xs text-slate-400 mb-3">or</p>
        <label className="cursor-pointer">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <ImagePlus className="h-3.5 w-3.5" /> Browse photos
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); }}
          />
        </label>
        {upload.isPending && (
          <p className="mt-3 text-xs text-slate-400">Uploading…</p>
        )}
      </div>

      {/* Photo grid */}
      {isLoading ? (
        <div className="text-xs text-slate-400 text-center py-4">Loading…</div>
      ) : photos.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-2">No photos yet</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <div key={photo.id} className="group overflow-hidden rounded-lg border bg-white shadow-sm">
              <button
                className="relative block aspect-square w-full overflow-hidden bg-slate-100"
                onClick={() => setViewPhoto(photo)}
                title="View full size"
              >
                {photo.customerFacing && (
                  <span className="absolute left-1.5 top-1.5 z-10 rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow">
                    Customer facing
                  </span>
                )}
                {photo.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.signedUrl}
                    alt={photo.caption ?? photo.fileName}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-300">
                    <Camera className="h-8 w-8" />
                  </div>
                )}
              </button>
              <div className="flex items-center gap-1 px-2 py-1.5">
                <input
                  defaultValue={photo.caption ?? ""}
                  placeholder="Add caption…"
                  className="min-w-0 flex-1 bg-transparent text-xs text-slate-600 placeholder:text-slate-300 focus:outline-none"
                  onBlur={(e) => {
                    const caption = e.target.value.trim();
                    if (caption !== (photo.caption ?? "")) {
                      updateCaption.mutate({ photoId: photo.id, caption }, { onError: () => toast.error("Failed to save caption") });
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
                <button
                  onClick={() => updateVisibility.mutate({ photoId: photo.id, customerFacing: !photo.customerFacing }, { onError: () => toast.error("Failed to update visibility") })}
                  className={cn(
                    "rounded p-1 transition-colors",
                    photo.customerFacing
                      ? "text-brand-500 hover:bg-brand-50"
                      : "text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                  )}
                  title={photo.customerFacing ? "Customer facing — shown on estimate document" : "Internal only — click to show on estimate document"}
                >
                  {photo.customerFacing ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("Remove this photo?")) return;
                    await remove.mutateAsync(photo.id);
                    toast.success("Photo removed");
                  }}
                  className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={!!viewPhoto} onOpenChange={(open) => { if (!open) setViewPhoto(null); }}>
        <DialogContent className="max-w-4xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>{viewPhoto?.caption ?? viewPhoto?.fileName ?? "Photo"}</DialogTitle>
          </DialogHeader>
          {viewPhoto?.signedUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viewPhoto.signedUrl}
              alt={viewPhoto.caption ?? viewPhoto.fileName}
              className="max-h-[80vh] w-full rounded object-contain"
            />
          )}
          {viewPhoto?.caption && (
            <p className="px-2 pb-1 text-center text-sm text-slate-600">{viewPhoto.caption}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
