"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useDocumentTemplates,
  useCreateDocumentTemplate,
  useDeleteDocumentTemplate,
  useUpdateDocumentTemplate,
} from "@/lib/hooks/use-crm-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DOC_TYPE_LABELS } from "@/types/crm-documents";
import type { DocStatus, DocType, DocumentTemplate } from "@/types/crm-documents";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  });
}

type Tab = "active" | "inactive" | "all";

// ── New Document Dialog ───────────────────────────────────────────────────────

function NewDocumentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const createDoc = useCreateDocumentTemplate();
  const [name, setName]           = useState("");
  const [docType, setDocType]     = useState<DocType>("client");
  const [description, setDescription] = useState("");
  const [subject, setSubject]     = useState("");
  const [saving, setSaving]       = useState(false);

  async function handleCreate() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const doc = await createDoc.mutateAsync({
        name: name.trim(),
        docType,
        description: description.trim() || undefined,
        subject: subject.trim() || undefined,
      });
      toast.success("Document created");
      onOpenChange(false);
      router.push(`/crm/settings/documents/${doc.id}`);
    } catch {
      toast.error("Failed to create document");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setName(""); setDocType("client"); setDescription(""); setSubject(""); setSaving(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name <span className="text-red-500">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Estimate - General Email" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Email Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Your estimate from [companyname]" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional internal note" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={saving}>
            {saving ? "Creating…" : "Create & Edit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main list ─────────────────────────────────────────────────────────────────

export function DocumentsList() {
  const router = useRouter();
  const { data: templates = [], isLoading } = useDocumentTemplates();
  const deleteDoc = useDeleteDocumentTemplate();

  const [newOpen, setNewOpen]     = useState(false);
  const [tab, setTab]             = useState<Tab>("active");
  const [typeFilter, setTypeFilter] = useState<DocType | "all">("all");
  const [search, setSearch]       = useState("");

  const filtered = useMemo(() => {
    let list = templates;
    if (tab !== "all") list = list.filter((t) => t.status === tab);
    if (typeFilter !== "all") list = list.filter((t) => t.docType === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [templates, tab, typeFilter, search]);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Active / Inactive / All tabs */}
        <div className="flex overflow-hidden rounded-md border text-xs">
          {(["active", "inactive", "all"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 capitalize transition-colors ${
                tab === t ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as DocType | "all")}>
          <SelectTrigger className="w-40 text-xs h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" onClick={() => setNewOpen(true)} className="ml-auto">
          <Plus className="mr-1.5 h-4 w-4" /> Add Document
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 text-left">Title</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-left">Date Modified</th>
              <th className="w-12 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                  {search || typeFilter !== "all"
                    ? "No documents match your filters."
                    : "No documents yet — click Add Document to get started."}
                </td>
              </tr>
            ) : (
              filtered.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  onEdit={() => router.push(`/crm/settings/documents/${doc.id}`)}
                  onDelete={() =>
                    deleteDoc.mutateAsync(doc.id).then(() => toast.success("Deleted"))
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <NewDocumentDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function DocumentRow({
  doc,
  onEdit,
  onDelete,
}: {
  doc: DocumentTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const updateDoc = useUpdateDocumentTemplate(doc.id);

  async function toggleStatus() {
    const next: DocStatus = doc.status === "active" ? "inactive" : "active";
    await updateDoc.mutateAsync({ status: next });
    toast.success(next === "active" ? "Activated" : "Deactivated");
  }

  return (
    <tr
      className="cursor-pointer border-b hover:bg-slate-50"
      onClick={onEdit}
    >
      <td className="px-4 py-2.5">
        <span className="font-medium text-brand-600 hover:underline">{doc.name}</span>
        {doc.isDefault && (
          <span className="ml-2 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
            Default
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-slate-600">{DOC_TYPE_LABELS[doc.docType]}</td>
      <td className="max-w-xs truncate px-4 py-2.5 text-slate-500">{doc.description ?? "—"}</td>
      <td className="px-4 py-2.5 text-slate-500">{fmtDate(doc.updatedAt)}</td>
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded p-1 hover:bg-slate-100">
              <MoreHorizontal className="h-4 w-4 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={toggleStatus}>
              {doc.status === "active" ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={() => { if (confirm("Delete this document template?")) onDelete(); }}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
