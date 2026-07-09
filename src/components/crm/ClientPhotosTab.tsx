"use client";

import { useRouter } from "next/navigation";
import { useClientPhotoJobs } from "@/lib/hooks/use-client-cmms";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, MapPin } from "lucide-react";

interface Props {
  clientId: string;
  clientName: string;
}

const PHOTO_STATUS_COLOR: Record<string, string> = {
  active:   "bg-brand-100 text-brand-700 border-brand-200",
  complete: "bg-slate-100 text-slate-600 border-slate-200",
  pending:  "bg-purple-100 text-purple-700 border-purple-200",
};

export function ClientPhotosTab({ clientId, clientName }: Props) {
  const { data: jobs, isLoading } = useClientPhotoJobs(clientId, clientName);
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (!jobs?.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-white py-12 text-center">
        <Camera className="h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">No photo jobs yet</p>
        <p className="text-xs text-slate-400">
          Photo jobs matching this client&apos;s name will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm divide-y">
      {jobs.map((job) => {
        const address = [job.address, job.city, job.state].filter(Boolean).join(", ");
        return (
          <button
            key={job.id}
            onClick={() => router.push(`/photos/jobs/${job.id}`)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
          >
            <Camera className="h-4 w-4 shrink-0 text-slate-300" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-slate-800">{job.name}</p>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PHOTO_STATUS_COLOR[job.status] ?? PHOTO_STATUS_COLOR.active}`}>
                  {job.status}
                </span>
                {job.isArchived && (
                  <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Archived
                  </span>
                )}
              </div>
              {address && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400">
                  <MapPin className="h-3 w-3 shrink-0" /> {address}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right text-xs text-slate-400">
              <p>{job.photoCount} photo{job.photoCount !== 1 ? "s" : ""}</p>
              <p>{new Date(job.createdAt).toLocaleDateString()}</p>
            </div>
          </button>
        );
      })}
      <div className="px-4 py-2 text-xs text-slate-400">
        {jobs.length} photo job{jobs.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
