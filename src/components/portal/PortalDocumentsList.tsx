"use client";

import { useState } from "react";
import { FileText, Download, Eye, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { PortalDocument } from "@/types/portal-document";

const BUCKET = "portal-documents";

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Files a browser can show in a tab, so they get a View button too. */
function isViewable(doc: PortalDocument) {
  const type = doc.mimeType ?? "";
  if (type === "application/pdf" || type.startsWith("image/") || type === "text/plain") return true;
  return !type && /\.(pdf|png|jpe?g|gif|webp|txt)$/i.test(doc.fileName);
}

export default function PortalDocumentsList({ documents }: { documents: PortalDocument[] }) {
  // "<id>:view" / "<id>:download" — which button is fetching its signed URL.
  const [busy, setBusy] = useState<string | null>(null);

  async function signedUrl(doc: PortalDocument, download: boolean) {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      // `download` makes Storage send Content-Disposition: attachment, so the
      // browser saves the file (under its original name) instead of showing it.
      .createSignedUrl(doc.storagePath, 300, download ? { download: doc.fileName || true } : undefined);
    if (error || !data) throw error ?? new Error("No signed URL");
    return data.signedUrl;
  }

  async function handleView(doc: PortalDocument) {
    // Open the tab synchronously in the click, then point it at the file once
    // the signed URL arrives — a window.open() after an await is treated as
    // an unsolicited popup and blocked by most browsers.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusy(`${doc.id}:view`);
    try {
      const url = await signedUrl(doc, false);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch {
      tab?.close();
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload(doc: PortalDocument) {
    setBusy(`${doc.id}:download`);
    try {
      const url = await signedUrl(doc, true);
      // Same-tab navigation to an attachment URL downloads without leaving the page.
      window.location.href = url;
    } finally {
      setBusy(null);
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
                <div className="flex shrink-0 items-center gap-2">
                  {isViewable(doc) && (
                    <button
                      onClick={() => handleView(doc)}
                      disabled={busy === `${doc.id}:view`}
                      className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busy === `${doc.id}:view` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      View
                    </button>
                  )}
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={busy === `${doc.id}:download`}
                    className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busy === `${doc.id}:download` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
