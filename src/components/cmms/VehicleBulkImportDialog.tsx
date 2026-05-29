"use client";

import { useRef, useState, useCallback } from "react";
import {
  ArrowRight,
  Check,
  FolderOpen,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useVehicles } from "@/lib/hooks/use-vehicles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import type { Vehicle } from "@/types";

// ── Fuzzy vehicle matching ────────────────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function matchVehicle(folderName: string, vehicles: Vehicle[]): string | null {
  const folderWords = new Set(normalize(folderName).split(" ").filter(Boolean));
  let bestId: string | null = null;
  let bestScore = 0;

  for (const v of vehicles) {
    const nameWords = normalize(v.name).split(" ").filter(Boolean);
    const matches = nameWords.filter((w) => folderWords.has(w)).length;
    const score = matches / Math.max(folderWords.size, nameWords.length);
    if (score > bestScore && score >= 0.4) {
      bestScore = score;
      bestId = v.id;
    }
  }
  return bestId;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type GroupStatus = "pending" | "uploading" | "done" | "error";

interface FolderGroup {
  folderName: string;
  files: File[];
  vehicleId: string | null;
  status: GroupStatus;
  succeeded: number;
  failed: number;
}

// ── Upload helper (mirrors useUploadAttachment logic) ─────────────────────────

async function uploadFilesToVehicle(
  vehicleId: string,
  files: File[],
  uploaderName: string,
): Promise<{ succeeded: number; failed: number }> {
  const supabase = createClient();
  let succeeded = 0;
  let failed = 0;

  await Promise.all(
    files.map(async (file) => {
      try {
        const storagePath = `vehicle/${vehicleId}/${Date.now()}-${file.name}`;

        let uploadError: { message: string } | null = null;
        try {
          ({ error: uploadError } = await supabase.storage
            .from("attachments")
            .upload(storagePath, file, { upsert: false, contentType: file.type }));
        } catch (e) {
          uploadError = e instanceof Error ? e : { message: String(e) };
        }

        // Safari + iCloud fallback
        if (uploadError && /load failed|failed to fetch/i.test(uploadError.message)) {
          const buffer = await file.arrayBuffer();
          const blob = new Blob([buffer], { type: file.type });
          try {
            ({ error: uploadError } = await supabase.storage
              .from("attachments")
              .upload(storagePath, blob, { upsert: true, contentType: file.type }));
          } catch (e) {
            uploadError = e instanceof Error ? e : { message: String(e) };
          }
        }

        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from("attachments").insert({
          record_type: "vehicle",
          record_id: vehicleId,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          storage_path: storagePath,
          uploaded_by_name: uploaderName,
        });

        if (insertError) {
          await supabase.storage.from("attachments").remove([storagePath]);
          throw insertError;
        }

        succeeded++;
      } catch {
        failed++;
      }
    })
  );

  return { succeeded, failed };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface VehicleBulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VehicleBulkImportDialog({
  open,
  onOpenChange,
}: VehicleBulkImportDialogProps) {
  const { data: vehicles = [] } = useVehicles();
  const queryClient = useQueryClient();
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [groups, setGroups] = useState<FolderGroup[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // ── Parse folder selection ─────────────────────────────────────────────────

  const handleFolderSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (!files.length) return;

      // Group by immediate parent folder of each file.
      // webkitRelativePath = "ParentFolder/SubFolder/file.pdf" or "ParentFolder/file.pdf"
      const map = new Map<string, File[]>();
      for (const file of files) {
        const parts = file.webkitRelativePath
          ? file.webkitRelativePath.split("/")
          : [file.name];
        // Use the folder one level above the file
        const folder =
          parts.length >= 2 ? parts[parts.length - 2] : "(root)";
        if (!map.has(folder)) map.set(folder, []);
        map.get(folder)!.push(file);
      }

      const newGroups: FolderGroup[] = Array.from(map.entries()).map(
        ([folderName, folderFiles]) => ({
          folderName,
          files: folderFiles,
          vehicleId: matchVehicle(folderName, vehicles),
          status: "pending",
          succeeded: 0,
          failed: 0,
        })
      );

      setGroups(newGroups);
      e.target.value = "";
    },
    [vehicles]
  );

  // ── Upload all ─────────────────────────────────────────────────────────────

  async function handleUploadAll() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user?.id ?? "")
      .single();
    const uploaderName = profile?.name ?? user?.email ?? "Unknown";

    setIsUploading(true);

    const toUpload = groups.filter((g) => g.vehicleId !== null);

    for (const group of toUpload) {
      setGroups((prev) =>
        prev.map((g) =>
          g.folderName === group.folderName ? { ...g, status: "uploading" } : g
        )
      );

      const { succeeded, failed } = await uploadFilesToVehicle(
        group.vehicleId!,
        group.files,
        uploaderName,
      );

      setGroups((prev) =>
        prev.map((g) =>
          g.folderName === group.folderName
            ? {
                ...g,
                status: failed > 0 && succeeded === 0 ? "error" : "done",
                succeeded,
                failed,
              }
            : g
        )
      );

      // Invalidate the attachments query for this vehicle
      queryClient.invalidateQueries({
        queryKey: ["attachments", "vehicle", group.vehicleId],
      });
    }

    setIsUploading(false);
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const assignedGroups = groups.filter((g) => g.vehicleId !== null);
  const totalFiles = assignedGroups.reduce((n, g) => n + g.files.length, 0);
  const allDone = groups.length > 0 && groups.every((g) => g.vehicleId === null || g.status === "done" || g.status === "error");
  const anyUploaded = groups.some((g) => g.status === "done" || g.status === "error");

  function handleClose(val: boolean) {
    if (isUploading) return;
    if (!val) {
      setGroups([]);
    }
    onOpenChange(val);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Vehicle Files</DialogTitle>
          <DialogDescription>
            Select your OneDrive vehicles folder. Each subfolder is matched to a
            vehicle by name — review the matches before uploading.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: folder picker ── */}
        {groups.length === 0 && (
          <div
            className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-slate-200 px-6 py-10 text-center transition-colors hover:border-slate-300 hover:bg-slate-50"
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderOpen className="h-8 w-8 text-slate-300" />
            <div>
              <p className="text-sm font-medium text-slate-700">
                Click to choose your vehicles folder
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Select the parent folder that contains one subfolder per vehicle
              </p>
            </div>
            <Button variant="outline" size="sm" type="button">
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Choose Folder
            </Button>
          </div>
        )}

        {/* Hidden folder input */}
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error — webkitdirectory is not in standard TS types
          webkitdirectory=""
          className="hidden"
          onChange={handleFolderSelect}
        />

        {/* ── Step 2: review matches ── */}
        {groups.length > 0 && (
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
            {groups.map((group) => (
              <div
                key={group.folderName}
                className="flex items-center gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5"
              >
                {/* Status icon */}
                <div className="shrink-0">
                  {group.status === "uploading" && (
                    <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
                  )}
                  {group.status === "done" && (
                    <Check className="h-4 w-4 text-green-500" />
                  )}
                  {group.status === "error" && (
                    <X className="h-4 w-4 text-red-500" />
                  )}
                  {group.status === "pending" && (
                    <FolderOpen className="h-4 w-4 text-amber-400" />
                  )}
                </div>

                {/* Folder name + file count */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {group.folderName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {group.status === "done"
                      ? `${group.succeeded} uploaded${group.failed > 0 ? `, ${group.failed} failed` : ""}`
                      : group.status === "error"
                      ? `${group.failed} failed`
                      : `${group.files.length} file${group.files.length !== 1 ? "s" : ""}`}
                  </p>
                </div>

                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />

                {/* Vehicle selector */}
                <Select
                  value={group.vehicleId ?? "__unassigned__"}
                  onValueChange={(val) =>
                    setGroups((prev) =>
                      prev.map((g) =>
                        g.folderName === group.folderName
                          ? { ...g, vehicleId: val === "__unassigned__" ? null : val }
                          : g
                      )
                    )
                  }
                  disabled={group.status !== "pending"}
                >
                  <SelectTrigger className="w-56 shrink-0">
                    <SelectValue placeholder="Select vehicle…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">
                      <span className="text-slate-400">Skip this folder</span>
                    </SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        {groups.length > 0 && (
          <DialogFooter className="flex items-center justify-between gap-3 sm:justify-between">
            {!allDone ? (
              <>
                <button
                  type="button"
                  className="text-xs text-slate-400 hover:text-slate-600"
                  onClick={() => {
                    setGroups([]);
                    folderInputRef.current?.click();
                  }}
                  disabled={isUploading}
                >
                  ← Choose different folder
                </button>
                <Button
                  onClick={handleUploadAll}
                  disabled={isUploading || assignedGroups.length === 0}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      Upload {totalFiles} file{totalFiles !== 1 ? "s" : ""} to{" "}
                      {assignedGroups.length} vehicle
                      {assignedGroups.length !== 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">
                  {anyUploaded
                    ? `Done — files are now visible on each vehicle's Files tab.`
                    : "No files were uploaded."}
                </p>
                <Button variant="outline" onClick={() => handleClose(false)}>
                  Close
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
