"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Trash2, Upload, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  usePortalDocuments,
  useUploadPortalDocument,
  useDeletePortalDocument,
} from "@/lib/hooks/use-portal-documents";

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PortalDocumentLibrary() {
  const { data: documents, isLoading } = usePortalDocuments();
  const { mutate: upload, isPending: uploading } = useUploadPortalDocument();
  const { mutate: remove } = useDeletePortalDocument();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!title.trim()) {
      toast.error("Add a title before choosing a file");
      return;
    }
    upload(
      { file, title: title.trim(), description: description.trim() || null, category: category.trim() },
      {
        onSuccess: () => {
          toast.success("Document uploaded");
          setTitle("");
          setDescription("");
          setCategory("");
        },
        onError: () => toast.error("Failed to upload document"),
      }
    );
  }

  function handleDelete(id: string, storagePath: string, docTitle: string) {
    if (!confirm(`Remove "${docTitle}" from the document library?`)) return;
    remove({ id, storagePath }, {
      onSuccess: () => toast.success("Document removed"),
      onError: () => toast.error("Failed to remove document"),
    });
  }

  const categories = Array.from(new Set((documents ?? []).map((d) => d.category)));

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b px-4 py-3 flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-800">Document Library</h2>
        <span className="ml-auto text-xs text-slate-400">
          Shared with every client — not client-specific
        </span>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Upload form */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Watering Instructions" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="General"
              list="portal-document-categories"
            />
            <datalist id="portal-document-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short note shown to clients" />
          </div>
        </div>
        <div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload File
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
        </div>

        {/* Document list */}
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading documents…</span>
          </div>
        ) : (documents ?? []).length === 0 ? (
          <p className="text-sm text-slate-400 py-2">No documents uploaded yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {documents!.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.title}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {doc.category} · {doc.fileName}
                      {doc.sizeBytes ? ` · ${formatSize(doc.sizeBytes)}` : ""}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs text-red-500 hover:text-red-600 shrink-0"
                  onClick={() => handleDelete(doc.id, doc.storagePath, doc.title)}
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
