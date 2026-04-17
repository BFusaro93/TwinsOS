"use client";

import { useRef } from "react";
import { FileText, Image, Upload } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useAttachments, useUploadAttachment, useDownloadAttachment } from "@/lib/hooks/use-attachments";
import { Button } from "@/components/ui/button";
import type { AttachmentRecordType } from "@/types";

interface AttachmentsSectionProps {
  recordType: AttachmentRecordType;
  recordId: string;
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    upload.mutate(file);
    // Reset input so the same file can be re-uploaded if needed
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
      />

      {/* Upload button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed text-slate-500 hover:text-slate-700"
        onClick={() => fileInputRef.current?.click()}
        disabled={upload.isPending}
      >
        <Upload className="mr-2 h-3.5 w-3.5" />
        {upload.isPending ? "Uploading…" : "Upload File"}
      </Button>

      {upload.isError && (
        <p className="text-xs text-red-500">
          Upload failed — {upload.error instanceof Error ? upload.error.message : String(upload.error)}
        </p>
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
                <p className="truncate text-sm font-medium text-slate-800">
                  {att.fileName}
                </p>
                <p className="text-xs text-slate-400">
                  {formatBytes(att.fileSize)} · Uploaded by {att.uploadedByName} · {formatDate(att.createdAt)}
                </p>
              </div>
              <button
                className="shrink-0 text-xs text-brand-600 hover:underline"
                onClick={() => download.mutate({ storagePath: att.storagePath, fileName: att.fileName })}
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
