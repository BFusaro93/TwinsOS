"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForms, useCreateForm, useDeleteForm, useUpdateForm } from "@/lib/hooks/use-crm-forms";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChevronDown, ExternalLink, FormInput, MoreHorizontal, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
import type { CRMForm, FormStatus } from "@/types/crm-forms";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

type ColFilterKey = "name" | "status";
const COL_FILTERS: { key: ColFilterKey; label: string }[] = [
  { key: "name",   label: "Form Name" },
  { key: "status", label: "Status" },
];

type QuickFilter = "all" | "published" | "draft";
const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "published", label: "Published" },
  { key: "draft",     label: "Draft" },
];

// ── New Form Dialog ────────────────────────────────────────────────────────────

interface NewFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function NewFormDialog({ open, onOpenChange }: NewFormDialogProps) {
  const router = useRouter();
  const createForm = useCreateForm();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      const form = await createForm.mutateAsync({ name: name.trim(), description, status: "draft" });
      onOpenChange(false);
      setName("");
      setDescription("");
      router.push(`/crm/communication/forms/${form.id}`);
    } catch {
      toast.error("Failed to create form");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Form</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Form Name</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Website Contact Form"
              className="h-9 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this form for?"
              rows={3}
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={!name.trim() || createForm.isPending}>
            {createForm.isPending ? "Creating…" : "Create & Build"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Row actions menu ──────────────────────────────────────────────────────────

function FormRowMenu({ form }: { form: CRMForm }) {
  const router = useRouter();
  const { can } = usePermissions();
  const canEdit = can("forms_edit");
  const deleteForm = useDeleteForm();
  const updateForm = useUpdateForm(form.id);
  const toggleStatus = form.status === "published" ? "draft" : "published";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-slate-100">
          <MoreHorizontal className="h-4 w-4 text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => router.push(`/crm/communication/forms/${form.id}?tab=responses`)}
        >
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          View Responses
        </DropdownMenuItem>
        {canEdit && (
          <>
            <DropdownMenuItem
              onSelect={() =>
                updateForm.mutate(
                  { status: toggleStatus as FormStatus },
                  { onError: () => toast.error("Failed to update form status") }
                )
              }
            >
              {toggleStatus === "published" ? "Publish" : "Unpublish"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onSelect={() => {
                if (confirm(`Delete "${form.name}"?`)) {
                  deleteForm.mutate(form.id, { onError: () => toast.error("Failed to delete form") });
                }
              }}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── FormsList ─────────────────────────────────────────────────────────────────

export function FormsList() {
  const router = useRouter();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const canEdit = can("forms_edit");
  const { data: forms = [], isLoading, refetch } = useForms();
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [activeColFilter, setActiveColFilter] = useState<ColFilterKey | null>(null);
  const [colFilterValue, setColFilterValue] = useState("");

  const stats = useMemo(() => ({
    total:      forms.length,
    published:  forms.filter((f) => f.status === "published").length,
    draft:      forms.filter((f) => f.status === "draft").length,
    responses:  forms.reduce((s, f) => s + f.responseCount, 0),
  }), [forms]);

  const quickCounts: Record<QuickFilter, number> = {
    all:       stats.total,
    published: stats.published,
    draft:     stats.draft,
  };

  const filtered = useMemo(() => {
    let list = forms;
    if (quickFilter !== "all") list = list.filter((f) => f.status === quickFilter);

    if (activeColFilter && colFilterValue.trim()) {
      const fv = colFilterValue.toLowerCase();
      list = list.filter((f) => {
        if (activeColFilter === "name")   return f.name.toLowerCase().includes(fv);
        if (activeColFilter === "status") return f.status.toLowerCase().includes(fv);
        return true;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }

    return list;
  }, [forms, quickFilter, activeColFilter, colFilterValue, search]);

  if (!permissionsLoading && !can("forms_view_submit")) {
    return (
      <EmptyState
        icon={FormInput}
        title="No access"
        description="You don't have permission to view Forms."
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Forms"
        description="Build and manage forms for clients and prospects"
        action={
          canEdit ? (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Form
            </Button>
          ) : undefined
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Forms",  value: stats.total,     color: "text-slate-900" },
          { label: "Published",    value: stats.published,  color: "text-green-600" },
          { label: "Draft",        value: stats.draft,      color: "text-yellow-600" },
          { label: "Responses",    value: stats.responses,  color: "text-sky-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-4 shadow-sm text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* White column filter bar */}
      <div className="flex items-center gap-1.5 border-b bg-white px-4 py-2">
        <span className="shrink-0 text-xs font-medium text-slate-500 mr-1">Select a Filter:</span>
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {COL_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                if (activeColFilter === key) { setActiveColFilter(null); setColFilterValue(""); }
                else { setActiveColFilter(key); setColFilterValue(""); }
              }}
              className={cn(
                "rounded px-2 py-0.5 text-xs transition-colors whitespace-nowrap",
                activeColFilter === key
                  ? "bg-brand-100 text-brand-700 font-medium"
                  : "hover:bg-slate-100 text-slate-600"
              )}
            >
              {label}
            </button>
          ))}
          {activeColFilter && (
            <>
              <Input
                autoFocus
                value={colFilterValue}
                onChange={(e) => setColFilterValue(e.target.value)}
                placeholder={`Filter by ${COL_FILTERS.find((f) => f.key === activeColFilter)?.label}…`}
                className="ml-2 h-6 w-48 text-xs"
              />
              <button onClick={() => { setActiveColFilter(null); setColFilterValue(""); }} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dark actions bar */}
      <div className="flex flex-wrap items-center gap-y-2 bg-[#4a4a4a] px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 gap-y-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 bg-[#5a5a5a] border-[#6a6a6a] text-white hover:bg-[#6a6a6a] text-xs px-3">
                Actions <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {canEdit && (
                <DropdownMenuItem onSelect={() => setNewOpen(true)}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> Add Form
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={() => refetch()}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#6a6a6a] bg-[#5a5a5a] text-white hover:bg-[#6a6a6a]"
            title="Refresh"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <div className="ml-2 flex min-w-0 items-center gap-1 overflow-x-auto">
            {QUICK_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setQuickFilter(key)}
                className={cn(
                  "flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                  quickFilter === key ? "bg-white text-slate-800" : "text-slate-300 hover:text-white"
                )}
              >
                {label}
                {quickCounts[key] > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    quickFilter === key ? "bg-slate-200 text-slate-700" : "bg-white/20 text-white"
                  )}>
                    {quickCounts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="relative ml-2">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search forms…"
              className="h-7 w-44 pl-7 text-xs bg-white border-slate-200 focus-visible:ring-0"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 border-b z-10">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Form Name</th>
              <th className="px-4 py-3">Date Created</th>
              <th className="px-4 py-3">Date Modified</th>
              <th className="px-4 py-3 text-right">Responses</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                  {forms.length === 0 ? "No forms yet — click Add Form to get started" : "No forms match your filter"}
                </td>
              </tr>
            ) : (
              filtered.map((form) => (
                <tr
                  key={form.id}
                  className="border-b hover:bg-slate-50 cursor-pointer"
                  onClick={() => router.push(`/crm/communication/forms/${form.id}`)}
                >
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide border",
                      form.status === "published"
                        ? "bg-green-50 text-green-700 border-green-300"
                        : "bg-slate-100 text-slate-500 border-slate-300"
                    )}>
                      {form.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-brand-600 hover:underline">
                    {form.name}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(form.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(form.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("font-medium tabular-nums", form.responseCount > 0 ? "text-brand-600" : "text-slate-400")}>
                      {form.responseCount}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <FormRowMenu form={form} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <NewFormDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
