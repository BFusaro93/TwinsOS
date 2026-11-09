"use client";

import { format, parseISO } from "date-fns";
import { Camera } from "lucide-react";
import { useJobVisitPhotos } from "@/lib/hooks/use-job-visit-photos";

/** Photos the crew took on this job from the crew app, grouped by visit date. */
export function JobVisitPhotos({ jobId }: { jobId: string }) {
  const { data: photos = [], isLoading } = useJobVisitPhotos(jobId);
  if (isLoading || photos.length === 0) return null;

  const byDate = new Map<string, typeof photos>();
  for (const p of photos) {
    const key = p.visitDate ?? p.createdAt.slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), p]);
  }

  return (
    <div className="mb-6">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Camera className="h-4 w-4" /> Crew photos ({photos.length})
      </h3>
      <div className="space-y-3">
        {[...byDate.entries()].map(([date, items]) => (
          <div key={date}>
            <p className="mb-1 text-xs text-muted-foreground">{format(parseISO(date), "EEE MMM d, yyyy")}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {items.map((p) => (
                p.url ? (
                  <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md border">
                    {/* Signed storage URL: next/image would need the host whitelisted. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.caption ?? "Crew photo"} className="aspect-square w-full object-cover" loading="lazy" />
                    {p.caption && <p className="truncate px-1 py-0.5 text-[11px] text-muted-foreground">{p.caption}</p>}
                  </a>
                ) : null
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
