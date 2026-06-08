"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPin, FileText } from "lucide-react";
import { usePhotoJob } from "@/modules/photo-docs/hooks/usePhotoJobs";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import { PhotoGallery } from "@/modules/photo-docs/components/PhotoGallery";
import { CrewPhotoView } from "@/modules/photo-docs/components/CrewPhotoView";
import { usePhotoAccess } from "@/modules/photo-docs/hooks/usePhotoAccess";

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-brand-100 text-brand-700",
  complete: "bg-slate-100 text-slate-600",
  on_hold:  "bg-amber-100 text-amber-700",
};

export default function JobPhotosPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const { isCrew } = usePhotoAccess();
  const { data: job } = usePhotoJob(jobId);

  return (
    <PhotoModuleGuard>
      <div className="flex flex-col gap-5">
        <div>
          <button onClick={() => router.push("/photos/jobs")} className="mb-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-3.5 w-3.5" /> All Jobs
          </button>
          <h1 className="text-xl font-semibold text-slate-900">{job?.name ?? "Job Photos"}</h1>
        </div>

        {job && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  {job.customerName && <p className="font-medium text-slate-900">{job.customerName}</p>}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_COLORS[job.status] ?? ""}`}>{job.status.replace("_", " ")}</span>
                  {job.projectId && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">Project linked</span>}
                </div>
                {job.address && (
                  <div className="flex items-center gap-1.5 text-sm text-slate-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0" /><span>{job.address}</span>
                  </div>
                )}
                {job.notes && (
                  <div className="flex items-start gap-1.5 text-sm text-slate-500">
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p className="leading-relaxed">{job.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isCrew ? (
          <CrewPhotoView projectId={jobId} projectName={job?.name ?? ""} projectAddress={job?.address ?? ""} />
        ) : (
          <PhotoGallery projectId={jobId} />
        )}
      </div>
    </PhotoModuleGuard>
  );
}
