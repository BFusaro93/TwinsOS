"use client";

import { useAttachments } from "@/lib/hooks/use-attachments";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

/** Thumbnail strip of a damage case's image attachments (signed at read time). */
export function DamageCasePhotos({ caseId }: { caseId: string }) {
  const { data: attachments } = useAttachments("damage_case", caseId);
  const images = (attachments ?? []).filter((a) => a.fileType.startsWith("image/"));
  const paths = images.map((a) => a.storagePath);

  const { data: urls } = useQuery({
    queryKey: ["damage-case-photo-urls", caseId, paths],
    queryFn: async () => {
      const { data, error } = await createClient().storage.from("attachments").createSignedUrls(paths, 3600);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((d) => [d.path ?? "", d.signedUrl]));
    },
    enabled: paths.length > 0,
  });

  if (!images.length) return null;
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-semibold">Photos</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((a) => {
          const url = urls?.[a.storagePath];
          return url ? (
            <a key={a.id} href={url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-md border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={a.fileName} className="h-full w-full object-cover" />
            </a>
          ) : (
            <div key={a.id} className="aspect-square animate-pulse rounded-md border bg-muted" />
          );
        })}
      </div>
    </div>
  );
}
