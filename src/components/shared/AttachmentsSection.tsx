"use client";

import { useRef, useState } from "react";
import { FileText, Image, Upload, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useAttachments, useUploadAttachment, useDownloadAttachment } from "@/lib/hooks/use-attachments";
import { Button } from "@/components/ui/button";
import type { AttachmentRecordType } from "@/types";

interface AttachmentsSectionProps {
  recordType: AttachmentRecordType;
  recordId: string;
}

const ACCEPTED = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";
const ACCEPTED_TYPES = new Set([
  "image/",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

function isAccepted(file: File) {
  return (
    file.type.startsWith("image/") ||
    ACCEPTED_TYPES.has(file.type) ||
    // Fallback for files with no MIME type — accept by extension
    /\.(pdf|doc|docx|xls|xlsx|csv|txt)$/i.test(file.name)
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ fileType }: { fileType: string }) {
  if (fileType.startsWith("image/")) {
    return <Image className="h-4 w-4 text-blue-500" />;
  }
  return <FileText className="h-4 w-4 text-slate-400" />;
}

export function AttachmentsSection({ recordType, recordId }: AttachmentsSectionProps) {
  const { data: attachments, isLoading } = useAttachments(recordType, recordId);
  const upload = useUploadAttachment(recordType, recordId);
  const download = useDownloadAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [fileErrors, setFileErrors] = useState<{ fileName: string; error: string }[]>([]);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(isAccepted);
    if (!list.length) return;
    setFileErrors([]);
    const results = await upload.mutateAsync(list);
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      setFileErrors(failed.map((r) => ({ fileName: r.fileName, error: r.error ?? "Upload failed" })));
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear when truly leaving the drop zone (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  }

  const isPending = upload.isPending;
  const pendingCount = upload.variables
    ? Array.isArray(upload.variables)
      ? upload.variables.length
      : 1
    : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Hidden file input — multiple enabled */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={ACCEPTED}
        onChange={handleFileChange}
      />

      {/* Drop zone / upload button */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-md border-2 border-dashed transition-colors ${
          isDragging
            ? "border-brand-400 bg-brand-50"
            : "border-slate-200 bg-transparent hover:border-slate-300"
        }`}
      >
        <Button
          variant="ghost"
          size="sm"
          className="w-full gap-2 text-slate-500 hover:bg-transparent hover:text-slate-700"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
        >
          <Upload className="h-3.5 w-3.5 shrink-0" />
          {isPending
            ? pendingCount > 1
              ? `Uploading ${pendingCount} files…`
              : "Uploading…"
            : isDragging
            ? "Drop files here"
            : "Upload files or drag & drop"}
        </Button>
      </div>

      {/* Per-file upload errors */}
      {fileErrors.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-red-100 bg-red-50 px-3 py-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-red-700">
              {fileErrors.length === 1 ? "1 file failed to upload" : `${fileErrors.length} files failed to upload`}
            </p>
            <button
              type="button"
              className="text-red-400 hover:text-red-600"
              onClick={() => setFileErrors([])}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {fileErrors.map((fe) => (
              <li key={fe.fileName} className="text-xs text-red-600">
                <span className="font-medium">{fe.fileName}</span>
                {" — "}
                {fe.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* File list */}
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading files…</p>
      ) : attachments && attachments.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <FileIcon fileType={att.fileType} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{att.fileName}</p>
                <p className="text-xs text-slate-400">
                  {formatBytes(att.fileSize)} · {att.uploadedByName} · {formatDate(att.createdAt)}
                </p>
              </div>
              <button
                className="shrink-0 text-xs text-brand-600 hover:underline"
                onClick={() =>
                  download.mutate({ storagePath: att.storagePath, fileName: att.fileName })
                }
              >
                View
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">No files attached.</p>
      )}
    </div>
  );
}
