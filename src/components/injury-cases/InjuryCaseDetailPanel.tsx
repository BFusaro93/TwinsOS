"use client";

import { useState } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditButton } from "@/components/shared/EditButton";
import { CommentsSection } from "@/components/shared/CommentsSection";
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { useInjuryCase, useUpdateInjuryCase, useDeleteInjuryCase } from "@/lib/hooks/use-injury-cases";
import { NewInjuryCaseDialog } from "./NewInjuryCaseDialog";
import { INJURY_STATUS_COLORS, INJURY_SEVERITY_COLORS } from "./injury-colors";
import { INJURY_CASE_STATUS_LABELS, INJURY_SEVERITY_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { InjuryCaseStatus } from "@/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="whitespace-pre-wrap">{children}</span>
    </div>
  );
}

export function InjuryCaseDetailPanel({ caseId, onClose }: { caseId: string; onClose?: () => void }) {
  const { data, isLoading } = useInjuryCase(caseId);
  const updateCase = useUpdateInjuryCase();
  const deleteCase = useDeleteInjuryCase();
  const [editOpen, setEditOpen] = useState(false);
  const [notesDialog, setNotesDialog] = useState<{ nextStatus: InjuryCaseStatus | null } | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!data) return null;

  const isClosed = data.status === "resolved" || data.status === "closed";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* pr-12 reserves space for Sheet's built-in close button */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-6 py-4 pr-12">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{data.caseNumber}</p>
          <h2 className="text-base font-semibold text-slate-900">{data.employeeName}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={INJURY_SEVERITY_COLORS[data.severity]}>{INJURY_SEVERITY_LABELS[data.severity]}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                <Badge className={`${INJURY_STATUS_COLORS[data.status]} text-xs`}>{INJURY_CASE_STATUS_LABELS[data.status]}</Badge>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {Object.entries(INJURY_CASE_STATUS_LABELS).map(([value, label]) => (
                <DropdownMenuItem
                  key={value}
                  className={value === data.status ? "font-medium text-brand-600" : ""}
                  onSelect={() => {
                    const next = value as InjuryCaseStatus;
                    if (next === data.status) return;
                    if (next === "resolved") {
                      setNotesDraft(data.resolutionNotes ?? "");
                      setNotesDialog({ nextStatus: next });
                      return;
                    }
                    updateCase.mutate({ id: data.id, status: next }, { onError: () => toast.error("Failed to update status") });
                  }}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <EditButton
            onClick={() => setEditOpen(true)}
            disabled={isClosed}
            title={isClosed ? "Reopen this case before editing its details" : undefined}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-500"
            disabled={isClosed}
            title={isClosed ? "Reopen this case before deleting it" : "Delete case"}
            onClick={async () => {
              try {
                await deleteCase.mutateAsync(data.id);
                onClose?.();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to delete case");
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-b px-6 py-3">
        <Row label="Incident Date">{formatDate(data.dateOfIncident)}</Row>
        <Row label="Location">{data.location}</Row>
        <Row label="Injury">{[data.injuryType, data.bodyPart].filter(Boolean).join(" · ")}</Row>
        <Row label="What happened">{data.description}</Row>
        <Row label="Treatment">{data.treatment}</Row>
        <Row label="Days Away From Work">{String(data.daysAway)}</Row>
        {data.recordable && <Badge className="bg-red-100 text-red-800">OSHA recordable</Badge>}
        {(data.resolutionNotes || isClosed) && (
          <div className="flex items-start gap-2 text-sm">
            <div className="min-w-0 flex-1">
              <span className="text-muted-foreground">Resolution Notes: </span>
              {data.resolutionNotes
                ? <span className="whitespace-pre-wrap">{data.resolutionNotes}</span>
                : <span className="italic text-muted-foreground">None recorded</span>}
            </div>
            {isClosed && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 text-muted-foreground"
                title="Edit resolution notes"
                onClick={() => { setNotesDraft(data.resolutionNotes ?? ""); setNotesDialog({ nextStatus: null }); }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="files" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 overflow-x-auto border-b px-4 md:px-6">
          <TabsList className="h-10 bg-transparent p-0">
            {(["files", "comments"] as const).map((v) => (
              <TabsTrigger
                key={v}
                value={v}
                className="h-10 whitespace-nowrap rounded-none border-b-2 border-transparent px-2.5 pb-0 pt-0 text-xs font-medium capitalize text-slate-500 md:px-4 md:text-sm data-[state=active]:border-brand-500 data-[state=active]:text-brand-600 data-[state=active]:shadow-none"
              >
                {v}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="files" className="mt-0 flex-1 overflow-y-auto p-6">
          <AttachmentsSection recordType="injury_case" recordId={data.id} />
        </TabsContent>
        <TabsContent value="comments" className="mt-0 flex-1 overflow-y-auto p-6">
          <CommentsSection recordType="injury_case" recordId={data.id} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!notesDialog} onOpenChange={(o) => { if (!o) setNotesDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{notesDialog?.nextStatus === "resolved" ? "Resolve Case" : "Resolution Notes"}</DialogTitle>
            <DialogDescription>Note the follow-up and any corrective action taken.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Resolution Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Textarea autoFocus rows={4} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNotesDialog(null)}>Cancel</Button>
            <Button
              type="button"
              disabled={updateCase.isPending}
              onClick={() => {
                if (!notesDialog) return;
                updateCase.mutate(
                  {
                    id: data.id,
                    resolutionNotes: notesDraft.trim() || null,
                    ...(notesDialog.nextStatus ? { status: notesDialog.nextStatus } : {}),
                  },
                  {
                    onSuccess: () => { setNotesDialog(null); toast.success(notesDialog.nextStatus ? "Case resolved" : "Notes saved"); },
                    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save"),
                  },
                );
              }}
            >
              {updateCase.isPending ? "Saving…" : notesDialog?.nextStatus === "resolved" ? "Mark Resolved" : "Save Notes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewInjuryCaseDialog open={editOpen} onOpenChange={setEditOpen} editCase={data} />
    </div>
  );
}
