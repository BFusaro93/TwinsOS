"use client";

import { useRef, useState } from "react";
import {
  useClientFiles,
  useUploadClientFile,
  useDeleteClientFile,
  useSignedFileUrl,
  type ClientFile,
} from "@/lib/hooks/use-client-files";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, FileText, Image, FileSpreadsheet, Trash2, Download, File } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  const mime = mimeType ?? "";
  if (mime.startsWith("image/")) return <Image className="h-5 w-5 text-blue-500" />;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv"))
    return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
  if (mime.includes("pdf")) return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-slate-400" />;
}

function FileRow({ file, onDeleted }: { file: ClientFile; onDeleted: () => void }) {
  const { mutateAsync: deleteFile, isPending: deleting } = useDeleteClientFile();
  const getUrl = useSignedFileUrl();
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const url = await getUrl(file.storagePath);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.target = "_blank";
      a.click();
    } catch {
      toast.error("Could not generate download link");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${file.name}"?`)) return;
    try {
      await deleteFile({ id: file.id, clientId: file.clientId, storagePath: file.storagePath });
      toast.success("File deleted");
      onDeleted();
    } catch {
      toast.error("Failed to delete file");
    }
  }

  return (
    <div className="group flex items-center gap-3 border-b px-4 py-3 hover:bg-slate-50">
      <FileIcon mimeType={file.mimeType} />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
        <p className="text-xs text-slate-400">{formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)}</p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleDownload}
          disabled={downloading}
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
          onClick={handleDelete}
          disabled={deleting}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

interface Props {
  clientId: string;
}

export function ClientFilesTab({ clientId }: Props) {
  const { data: files, isLoading, refetch } = useClientFiles(clientId);
  const { mutateAsync: upload, isPending: uploading } = useUploadClientFile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const results = await Promise.allSettled(
      Array.from(fileList).map((file) => upload({ clientId, file }))
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) toast.error(`${failed} file(s) failed to upload`);
    if (failed < results.length) toast.success(`${results.length - failed} file(s) uploaded`);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    void handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-2 shrink-0">
        <span className="text-xs text-slate-400">
          {isLoading ? "…" : `${(files ?? []).length} file${(files ?? []).length !== 1 ? "s" : ""}`}
        </span>
        <Button
          size="sm"
          className="h-8 bg-brand-500 hover:bg-brand-600 text-white text-xs"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="mr-1 h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Upload Files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {/* Drop zone + file list */}
      <div
        className={cn(
          "flex-1 overflow-auto",
          dragging && "bg-brand-50 outline-dashed outline-2 outline-brand-300"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (files ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Upload className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-400">No files yet</p>
            <p className="text-xs text-slate-300">Drag and drop files here, or click Upload Files above</p>
          </div>
        ) : (
          <>
            {(files ?? []).map((f) => (
              <FileRow key={f.id} file={f} onDeleted={refetch} />
            ))}
            {dragging && (
              <div className="flex items-center justify-center py-8 text-sm text-brand-600 font-medium">
                Drop to upload
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
