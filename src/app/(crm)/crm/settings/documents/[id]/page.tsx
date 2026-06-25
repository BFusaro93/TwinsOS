"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useDocumentTemplate } from "@/lib/hooks/use-crm-documents";
import { DocumentBuilder } from "@/components/crm/documents/DocumentBuilder";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: template, isLoading } = useDocumentTemplate(id);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-400">
        <p>Document not found.</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/crm/settings/documents")}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to Documents
        </Button>
      </div>
    );
  }

  return <DocumentBuilder template={template} />;
}
