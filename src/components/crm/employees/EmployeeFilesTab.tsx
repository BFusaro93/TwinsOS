"use client";

import { useRef, useState } from "react";
import { FileText, Image, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAttachments,
  useUploadAttachment,
  useDownloadAttachment,
  useDeleteAttachment,
} from "@/lib/hooks/use-attachments";
import { EMPLOYEE_DOCUMENT_TYPES, employeeDocumentLabel } from "@/lib/employees/documents";
import { formatDate } from "@/lib/utils";

const ACCEPTED = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Files for one employee (license copies, DOT cards, I-9s...). Access is
 * enforced in the database (View Employee Information / Edit / Manage); the
 * caller only decides whether to show the tab.
 */
export function EmployeeFilesTab({ employeeId }: { employeeId: string }) {
  const { data: files, isLoading } = useAttachments("employee", employeeId);
  const upload = useUploadAttachment("employee", employeeId);
  const download = useDownloadAttachment();
  const remove = useDeleteAttachment("employee", employeeId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState<string>("other");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    try {
      const results = await upload.mutateAsync({ files: Array.from(list), recordId: employeeId, documentType });
      const failed = results.filter((r) => !r.ok);
      if (failed.length) toast.error(`${failed.length} file(s) failed: ${failed[0].error ?? "upload failed"}`);
      else toast.success(results.length === 1 ? "File uploaded" : `${results.length} files uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3">
        <span className="text-sm text-muted-foreground">Document type</span>
        <Select value={documentType} onValueChange={setDocumentType}>
          <SelectTrigger className="h-8 w-48 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EMPLOYEE_DOCUMENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" className="gap-2" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          {upload.isPending ? "Uploading…" : "Upload files"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 dark:text-neutral-500">Loading files…</p>
      ) : !files || files.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-neutral-500">No files yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-md border bg-slate-50 px-3 py-2 dark:bg-muted/40">
              {f.fileType.startsWith("image/") ? (
                <Image className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              ) : (
                <FileText className="h-4 w-4 text-slate-400 dark:text-neutral-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.fileName}</p>
                <p className="text-xs text-slate-400 dark:text-neutral-500">
                  {formatBytes(f.fileSize)} · {f.uploadedByName} · {formatDate(f.createdAt)}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 font-normal">
                {employeeDocumentLabel(f.documentType)}
              </Badge>
              {confirmId === f.id ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">Delete this file?</span>
                  <button
                    className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: f.id, storagePath: f.storagePath }, { onSettled: () => setConfirmId(null) })}
                  >
                    Delete
                  </button>
                  <button className="text-xs text-muted-foreground" onClick={() => setConfirmId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    className="text-xs text-brand-600 hover:underline dark:text-brand-400"
                    onClick={() => download.mutate({ storagePath: f.storagePath, fileName: f.fileName })}
                  >
                    View
                  </button>
                  <button
                    className="text-slate-300 transition-colors hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
                    title="Delete file"
                    onClick={() => setConfirmId(f.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
