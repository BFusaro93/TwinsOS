"use client";

import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";
import type { JobPhoto } from "../types/photo.types";

interface BeforeAfterSliderProps {
  before: JobPhoto;
  after: JobPhoto;
}

export function BeforeAfterSlider({ before, after }: BeforeAfterSliderProps) {
  const beforeUrl = before.annotatedUrl ?? before.publicUrl ?? "";
  const afterUrl = after.annotatedUrl ?? after.publicUrl ?? "";

  return (
    <div className="space-y-3">
      {beforeUrl && afterUrl ? (
        <div className="overflow-hidden rounded-lg">
          <ReactCompareSlider
            itemOne={
              <ReactCompareSliderImage
                src={beforeUrl}
                alt="Before"
                style={{ objectFit: "contain", backgroundColor: "#27272a" }}
              />
            }
            itemTwo={
              <ReactCompareSliderImage
                src={afterUrl}
                alt="After"
                style={{ objectFit: "contain", backgroundColor: "#27272a" }}
              />
            }
            style={{ height: "400px", width: "100%", backgroundColor: "#27272a" }}
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
