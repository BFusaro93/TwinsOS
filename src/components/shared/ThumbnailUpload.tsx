"use client";

import { useRef, useState, useEffect } from "react";
import { Camera, Loader2 } from "lucide-react";
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
  // Local preview: show immediately after upload without waiting for parent prop update
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const displayUrl = localUrl ?? imageUrl;

  // Once the parent's imageUrl prop catches up to what we uploaded, clear the local copy
  useEffect(() => {
    if (imageUrl && localUrl && imageUrl === localUrl) {
      setLocalUrl(null);
    }
  }, [imageUrl, localUrl]);

  function handleClick() {
    if (!onUpload) return;
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
      // Reset input so the same file can be re-selected if needed
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
      <div
        className={`group relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 ${sizeClass} ${onUpload ? "cursor-pointer" : ""}`}
        title={onUpload ? "Click to upload photo" : undefined}
        onClick={handleClick}
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

        {/* Upload / loading overlay */}
        {onUpload && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            ) : (
              <Camera className="h-5 w-5 text-white" />
            )}
          </div>
        )}

        {/* Uploading spinner (always visible while uploading) */}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
      </div>
    </>
  );
}
