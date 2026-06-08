"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import { PhotoUploader } from "@/modules/photo-docs/components/PhotoUploader";

export default function UploadPhotosPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();

  return (
    <PhotoModuleGuard>
      <div className="flex flex-col gap-4">
        <div>
          <button
            onClick={() => router.push(`/photos/jobs/${jobId}`)}
            className="mb-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Gallery
          </button>
          <h1 className="text-xl font-semibold text-slate-900">Upload Photos</h1>
          <p className="text-sm text-slate-500">Add photos to this job</p>
        </div>
        <PhotoUploader projectId={jobId} />
      </div>
    </PhotoModuleGuard>
  );
}
