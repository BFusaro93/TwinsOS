"use client";

import { useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { PortalDocument } from "@/types/portal-document";

const BUCKET = "portal-documents";

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PortalDocumentsList({ documents }: { documents: PortalDocument[] }) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownload(doc: PortalDocument) {
    setDownloadingId(doc.id);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(doc.storagePath, 300);
      if (error || !data) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <FileText className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">No documents are available yet.</p>
      </div>
    );
  }

  const grouped = documents.reduce<Record<string, PortalDocument[]>>((acc, doc) => {
    (acc[doc.category] ??= []).push(doc);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      {Object.entries(grouped).map(([category, docs]) => (
        <div key={category}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{category}</h2>
          <div className="flex flex-col gap-2">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.title}</p>
                    {doc.description && (
                      <p className="text-xs text-slate-500 truncate">{doc.description}</p>
                    )}
                    <p className="text-xs text-slate-400">{formatSize(doc.sizeBytes)}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(doc)}
                  disabled={downloadingId === doc.id}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 shrink-0 disabled:opacity-50"
                >
                  {downloadingId === doc.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
