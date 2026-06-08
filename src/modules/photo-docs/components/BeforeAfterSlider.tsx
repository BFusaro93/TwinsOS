"use client";

import { useState } from "react";
import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { JobPhoto } from "../types/photo.types";

interface BeforeAfterSliderProps {
  beforePhotos: JobPhoto[];
  afterPhotos: JobPhoto[];
}

export function BeforeAfterSlider({ beforePhotos, afterPhotos }: BeforeAfterSliderProps) {
  const [pairIndex, setPairIndex] = useState(0);

  const maxPairs = Math.max(beforePhotos.length, afterPhotos.length);
  const before = beforePhotos[pairIndex] ?? beforePhotos[0];
  const after = afterPhotos[pairIndex] ?? afterPhotos[0];

  const beforeUrl = before?.annotatedUrl ?? before?.publicUrl ?? "";
  const afterUrl = after?.annotatedUrl ?? after?.publicUrl ?? "";

  return (
    <div className="space-y-3">
      {/* Pair navigator when there are multiple before/after sets */}
      {maxPairs > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={pairIndex === 0}
            onClick={() => setPairIndex((i) => Math.max(0, i - 1))}
            className="rounded p-1 text-slate-400 hover:text-white disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-slate-400">
            Pair {pairIndex + 1} of {maxPairs}
          </span>
          <button
            disabled={pairIndex >= maxPairs - 1}
            onClick={() => setPairIndex((i) => Math.min(maxPairs - 1, i + 1))}
            className="rounded p-1 text-slate-400 hover:text-white disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Slider */}
      {beforeUrl && afterUrl ? (
        <div className="overflow-hidden rounded-lg">
          <ReactCompareSlider
            itemOne={
              <ReactCompareSliderImage
                src={beforeUrl}
                alt="Before"
                style={{ objectFit: "cover" }}
              />
            }
            itemTwo={
              <ReactCompareSliderImage
                src={afterUrl}
                alt="After"
                style={{ objectFit: "cover" }}
              />
            }
            style={{ height: "400px", width: "100%" }}
          />
          <div className="mt-2 flex justify-between px-1 text-xs text-slate-500">
            <span className="font-medium text-amber-400">← Before</span>
            <span className="font-medium text-brand-400">After →</span>
          </div>
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg bg-slate-800 text-slate-500 text-sm">
          Loading images…
        </div>
      )}
    </div>
  );
}
