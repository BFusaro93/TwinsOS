"use client";

import { useMemo, useRef, useState } from "react";
import { Eye, FileText, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/shared/useConfirm";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useProducts } from "@/lib/hooks/use-products";
import {
  openReferenceDocument,
  useDeleteReferenceDocument,
  useReferenceDocuments,
  useUpdateReferenceDocument,
  useUploadReferenceDocument,
  type ReferenceDocumentInput,
} from "@/lib/hooks/use-reference-documents";
import {
  REFERENCE_CATEGORIES,
  referenceCategoryLabel,
  type ReferenceCategory,
  type ReferenceDocument,
} from "@/types/crm-reference";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EMPTY: ReferenceDocumentInput = {
  category: "sds",
  title: "",
  description: null,
  revisionDate: null,
  productIds: [],
  visibleToCrew: true,
};

/** Add (files chosen) or edit (existing document) — one dialog for both. */
export function DocumentDialog({
  open, onClose, editing, files, initialProductIds,
}: {
  open: boolean;
  onClose: () => void;
  editing: ReferenceDocument | null;
  files: File[];
  /** Products a NEW document starts linked to (e.g. when added from a product's page). */
  initialProductIds?: string[];
}) {
  const { data: allProducts = [] } = useProducts();
  const upload = useUploadReferenceDocument();
  const update = useUpdateReferenceDocument();
  const [form, setForm] = useState<ReferenceDocumentInput>(EMPTY);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [seed, setSeed] = useState<string | null>(null);

  // Re-seed the form whenever the dialog opens for a different document / file set.
  const seedKey = open ? `${editing?.id ?? "new"}:${files.map((f) => f.name).join("|")}` : null;
  if (seedKey !== seed) {
    setSeed(seedKey);
    if (open) {
      setProductSearch("");
      setForm(
        editing
          ? {
              category: editing.category,
              title: editing.title,
              description: editing.description,
              revisionDate: editing.revisionDate,
              productIds: editing.productIds,
              visibleToCrew: editing.visibleToCrew,
            }
          : { ...EMPTY, productIds: initialProductIds ?? [], title: files.length === 1 ? files[0].name.replace(/\.[^.]+$/, "") : "" }
      );
    }
  }

  const products = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return allProducts
      .filter((p) => !p.deletedAt && (p.trackChemicals || form.productIds.includes(p.id)))
      .filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [allProducts, productSearch, form.productIds]);

  const multi = !editing && files.length > 1;

  async function save() {
    if (!multi && !form.title.trim()) return toast.error("Give the document a title");
    setSaving(true);
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...form, title: form.title.trim() });
        toast.success("Document updated");
      } else {
        for (const file of files) {
          await upload.mutateAsync({
            file,
            ...form,
            // Several files at once: each is titled by its file name (edit one to link products).
            title: multi ? file.name.replace(/\.[^.]+$/, "") : form.title.trim(),
          });
        }
        toast.success(files.length === 1 ? "Document added" : `${files.length} documents added`);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the document");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit document" : multi ? `Add ${files.length} documents` : "Add document"}</DialogTitle>
          <DialogDescription>
            {editing ? editing.fileName : files.map((f) => f.name).join(", ")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {!multi && (
            <div className="grid gap-1">
              <Label className="text-xs">Title</Label>
              <Input className="h-8 text-xs" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Type</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ReferenceCategory })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REFERENCE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Revision date</Label>
              <Input
                className="h-8 text-xs"
                type="date"
                value={form.revisionDate ?? ""}
                onChange={(e) => setForm({ ...form, revisionDate: e.target.value || null })}
              />
            </div>
          </div>
          {!multi && (
            <div className="grid gap-1">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea rows={2} className="text-xs" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value || null })} />
            </div>
          )}
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={form.visibleToCrew} onCheckedChange={(v) => setForm({ ...form, visibleToCrew: v === true })} />
            Show to crews in the crew app
          </label>
          {!multi && (
            <div className="grid gap-1">
              <Label className="text-xs">Chemical products this covers</Label>
              <Input className="h-8 text-xs" placeholder="Search products…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
              <div className="max-h-40 overflow-y-auto rounded border p-2 grid gap-1.5">
                {products.length === 0 && <p className="text-xs text-muted-foreground">No chemical products match.</p>}
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={form.productIds.includes(p.id)}
                      onCheckedChange={(v) =>
                        setForm({ ...form, productIds: v === true ? [...form.productIds, p.id] : form.productIds.filter((x) => x !== p.id) })
                      }
                    />
                    {p.name}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Linked products show this document on their page and on the crew&apos;s &ldquo;View label&quot;.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : editing ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The company's Reference Library: chemical labels and Safety Data Sheets, SOPs, training and
 *  equipment lists, in one searchable place the crew app reads from. */
export function ReferenceLibrary() {
  const { data: docs = [], isLoading } = useReferenceDocuments();
  const { data: allProducts = [] } = useProducts();
  const { can, isLoading: permsLoading } = usePermissions();
  const canManage = !permsLoading && can("crm_settings");
  const del = useDeleteReferenceDocument();
  const [confirm, confirmDialog] = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | ReferenceCategory>("all");
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<ReferenceDocument | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const productName = useMemo(() => new Map(allProducts.map((p) => [p.id, p.name])), [allProducts]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (category !== "all" && d.category !== category) return false;
      if (!q) return true;
      const linked = d.productIds.map((id) => productName.get(id) ?? "").join(" ");
      return `${d.title} ${d.fileName} ${d.description ?? ""} ${linked}`.toLowerCase().includes(q);
    });
  }, [docs, search, category, productName]);

  function pickFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setEditing(null);
    setFiles([...list]);
    setDialogOpen(true);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function view(doc: ReferenceDocument) {
    try {
      await openReferenceDocument(doc.storagePath);
    } catch {
      toast.error("Couldn't open the document");
    }
  }

  async function remove(doc: ReferenceDocument) {
    if (!(await confirm({ title: `Delete “${doc.title}”?`, description: "Crews will no longer see it.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await del.mutateAsync({ id: doc.id, storagePath: doc.storagePath });
      toast.success("Document deleted");
    } catch {
      toast.error("Couldn't delete the document");
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reference Library</h1>
          <p className="text-sm text-muted-foreground">
            Chemical labels and Safety Data Sheets, SOPs, training and equipment lists &mdash; in one place, available to crews in the crew app.
          </p>
        </div>
        {canManage && (
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt"
              className="hidden"
              onChange={(e) => pickFiles(e.target.files)}
            />
            <Button size="sm" className="gap-1.5" onClick={() => fileInput.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Upload documents
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-8 w-64 text-xs" placeholder="Search title, file or product…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {[{ value: "all", label: "All" }, ...REFERENCE_CATEGORIES].map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value as "all" | ReferenceCategory)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                category === c.value ? "border-brand-600 bg-brand-600 text-white" : "border-border bg-card text-slate-600 dark:text-neutral-300"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border bg-card">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto mb-2 h-6 w-6 opacity-40" />
            {docs.length === 0
              ? canManage
                ? "No documents yet. Upload labels and Safety Data Sheets to get started."
                : "No documents yet."
              : "Nothing matches."}
            {docs.length === 0 && canManage && (
              <div className="mt-3">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileInput.current?.click()}>
                  <Plus className="h-3.5 w-3.5" /> Upload documents
                </Button>
              </div>
            )}
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{d.title}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{referenceCategoryLabel(d.category)}</span>
                    {!d.visibleToCrew && <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">Office only</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[d.fileName, formatBytes(d.sizeBytes), d.revisionDate ? `Revised ${new Date(`${d.revisionDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {d.productIds.length > 0 && (
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-neutral-400">
                      {d.productIds.map((id) => productName.get(id)).filter(Boolean).join(", ")}
                    </p>
                  )}
                  {d.description && <p className="mt-0.5 text-xs text-muted-foreground">{d.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => void view(d)}>
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                  {canManage && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit" onClick={() => { setFiles([]); setEditing(d); setDialogOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" aria-label="Delete" onClick={() => void remove(d)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DocumentDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setFiles([]); setEditing(null); }}
        editing={editing}
        files={files}
      />
      {confirmDialog}
    </div>
  );
}
