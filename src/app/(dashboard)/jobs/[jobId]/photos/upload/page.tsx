"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { PhotoModuleGuard } from "@/modules/photo-docs/components/PhotoModuleGuard";
import { PhotoUploader } from "@/modules/photo-docs/components/PhotoUploader";

export default function UploadPhotosPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const router = useRouter();

  return (
    <PhotoModuleGuard>
      <div className="flex h-full flex-col">
        <PageHeader
          title="Upload Photos"
          description="Add photos to this job"
          action={
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-slate-400"
              onClick={() => router.push(`/jobs/${jobId}/photos`)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Gallery
            </Button>
          }
        />
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <PhotoUploader projectId={jobId} />
        </div>
      </div>
    </PhotoModuleGuard>
  );
}
