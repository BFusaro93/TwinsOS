"use client";

import { Camera } from "lucide-react";

interface ThumbnailUploadProps {
  imageUrl: string | null | undefined;
  alt: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-16 w-16",
  md: "h-24 w-24",
  lg: "h-32 w-32",
};

export function ThumbnailUpload({ imageUrl, alt, size = "md" }: ThumbnailUploadProps) {
  const sizeClass = sizeClasses[size];

  return (
    <div
      className={`group relative shrink-0 cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-slate-50 ${sizeClass}`}
      title="Upload photo"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Camera className="h-6 w-6 text-slate-300" />
        </div>
      )}
      {/* Hover overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        <Camera className="h-5 w-5 text-white" />
      </div>
    </div>
  );
}
