"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Camera, Loader2, X, ZoomIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface ThumbnailUploadProps {
  imageUrl: string | null | undefined;
  alt: string;
  size?: "sm" | "md" | "lg";
  /** Called with the public URL after a successful upload. */
  onUpload?: (url: string) => void;
}

const sizeClasses = {
  sm: "h-16 w-16",
  md: "h-24 w-24",
  lg: "h-32 w-32",
};

export function ThumbnailUpload({ imageUrl, alt, size = "md", onUpload }: ThumbnailUploadProps) {
  const sizeClass = sizeClasses[size];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Local preview: show immediately after upload without waiting for parent prop update
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const displayUrl = localUrl ?? imageUrl;

  // Once the parent's imageUrl prop catches up to what we uploaded, clear the local copy
  useEffect(() => {
    if (imageUrl && localUrl && imageUrl === localUrl) {
      setLocalUrl(null);
    }
  }, [imageUrl, localUrl]);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  function handleThumbnailClick() {
    if (displayUrl) {
      // Image exists → open lightbox
      setLightboxOpen(true);
    } else if (onUpload) {
      // No image → open file picker
      fileInputRef.current?.click();
    }
  }

  function handleUploadClick(e: React.MouseEvent) {
    if (!onUpload) return;
    e.stopPropagation(); // don't also open lightbox
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;

    setIsUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `thumbnails/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("thumbnails")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
      setLocalUrl(data.publicUrl);
      onUpload(data.publicUrl);
    } catch (err) {
      console.error("[ThumbnailUpload]", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Thumbnail */}
      <div
        className={`group relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 ${sizeClass} ${displayUrl ? "cursor-zoom-in" : onUpload ? "cursor-pointer" : ""}`}
        title={displayUrl ? "Click to view full image" : onUpload ? "Click to upload photo" : undefined}
        onClick={handleThumbnailClick}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={alt}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Camera className="h-6 w-6 text-slate-300" />
          </div>
        )}

        {/* Zoom hint overlay when image exists */}
        {displayUrl && !isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-5 w-5 text-white" />
          </div>
        )}

        {/* Upload overlay when no image */}
        {!displayUrl && onUpload && !isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-5 w-5 text-white" />
          </div>
        )}

        {/* Uploading spinner */}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}

        {/* Small camera button in corner when image exists and upload is allowed */}
        {displayUrl && onUpload && !isUploading && (
          <button
            type="button"
            title="Upload new photo"
            onClick={handleUploadClick}
            className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
          >
            <Camera className="h-3.5 w-3.5 text-white" />
          </button>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && displayUrl && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setLightboxOpen(false)}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setLightboxOpen(false)}
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={displayUrl}
              alt={alt}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
    </>
  );
}
