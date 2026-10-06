"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  useInvoicePhotos,
  useAttachInvoicePhotos,
  useUploadInvoicePhotos,
  useUpdateInvoicePhotoCaption,
  useRemoveInvoicePhotos,
} from "@/lib/hooks/use-invoice-photos";
import { INVOICE_PHOTO_LIMIT, type InvoicePhoto, type InvoicePhotoCandidate } from "@/types/invoice-photos";

interface Props {
  invoiceId: string;
  /** Whether the viewer may attach / edit / remove photos. */
  canEdit: boolean;
}

const SOURCE_LABEL: Record<InvoicePhoto["source"], string> = {
  visit_photo: "Visit photos",
  job_photo: "Job photos",
  upload: "Uploaded",
};

function CaptionInput({ photo, disabled, onSave }: { photo: InvoicePhoto; disabled: boolean; onSave: (caption: string) => void }) {
  const [value, setValue] = useState(photo.caption ?? "");
  return (
    <Input
      value={value}
      disabled={disabled}
      placeholder="Caption"
      maxLength={300}
      className="mt-1 h-7 text-xs"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { if (value.trim() !== (photo.caption ?? "")) onSave(value); }}
    />
  );
}

/** Photos on an invoice: whatever is attached prints in the PDF and shows on
 *  the customer's online invoice page. Pulls from visit photos, job photos and
 *  direct uploads in one place. */
export function InvoicePhotosPanel({ invoiceId, canEdit }: Props) {
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useInvoicePhotos(invoiceId, { candidates: picking, search: activeSearch });
  const attach = useAttachInvoicePhotos(invoiceId);
  const upload = useUploadInvoicePhotos(invoiceId);
  const saveCaption = useUpdateInvoicePhotoCaption(invoiceId);
  const remove = useRemoveInvoicePhotos(invoiceId);

  const attached = data?.attached ?? [];
  const candidates = (data?.candidates ?? []).filter((c) => !c.alreadyAttached);
  const room = INVOICE_PHOTO_LIMIT - attached.length;
  const key = (c: InvoicePhotoCandidate) => `${c.source}:${c.sourceId}`;

  function toggle(c: InvoicePhotoCandidate) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key(c))) next.delete(key(c));
      else if (next.size < room) next.add(key(c));
      else toast.error(`An invoice can include at most ${INVOICE_PHOTO_LIMIT} photos`);
      return next;
    });
  }

  function attachSelected() {
    const photos = candidates
      .filter((c) => selected.has(key(c)))
      .map((c) => ({ source: c.source, sourceId: c.sourceId }));
    if (photos.length === 0) return;
    attach.mutate(photos, {
      onSuccess: () => { setSelected(new Set()); toast.success(`${photos.length} photo${photos.length === 1 ? "" : "s"} added`); },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to attach photos"),
    });
  }

  function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    upload.mutate(Array.from(files), {
      onSuccess: () => toast.success("Photos uploaded"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  // Group candidates by source then group label.
  const groups = new Map<string, InvoicePhotoCandidate[]>();
  for (const c of candidates) {
    const k = `${c.source === "visit_photo" ? "Visit photos" : "Job photos"} — ${c.groupLabel}${c.match === "name_search" ? " (name match)" : ""}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {attached.length} of {INVOICE_PHOTO_LIMIT} photos included. They print on the invoice PDF and show on the online invoice page.
        </p>
        {canEdit && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPicking((p) => !p)} disabled={room <= 0 && !picking}>
              <ImagePlus className="mr-1 h-3.5 w-3.5" />
              {picking ? "Close picker" : "Add from job / visit photos"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => fileRef.current?.click()} disabled={room <= 0 || upload.isPending}>
              {upload.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
              Upload
            </Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error instanceof Error ? error.message : "Failed to load photos"}</p>}
      {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-neutral-500" />}

      {attached.length === 0 && !isLoading && (
        <p className="rounded border border-dashed py-6 text-center text-xs text-slate-400 dark:text-neutral-500">No photos on this invoice yet.</p>
      )}

      {(["visit_photo", "job_photo", "upload"] as const).map((src) => {
        const list = attached.filter((p) => p.source === src);
        if (list.length === 0) return null;
        return (
          <div key={src}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">{SOURCE_LABEL[src]}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {list.map((p) => (
                <div key={p.id} className="rounded border bg-card p-1.5">
                  <div className="relative">
                    {p.signedUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.signedUrl} alt={p.caption ?? "Invoice photo"} className="h-28 w-full rounded object-cover" />
                    ) : (
                      <div className="flex h-28 w-full items-center justify-center rounded bg-muted text-[10px] text-slate-400 dark:text-neutral-500">Unavailable</div>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        aria-label="Remove photo from invoice"
                        className="absolute right-1 top-1 rounded bg-card/90 p-1 text-slate-600 dark:text-neutral-400 shadow hover:text-red-600 dark:hover:text-red-400"
                        onClick={() => remove.mutate([p.id], { onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove photo") })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <CaptionInput
                    photo={p}
                    disabled={!canEdit}
                    onSave={(caption) => saveCaption.mutate({ id: p.id, caption }, { onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save caption") })}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {picking && canEdit && (
        <div className="space-y-3 rounded-md border bg-slate-50 dark:bg-muted/40 p-3">
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setActiveSearch(search.trim()); }}
              placeholder="Search job photos by customer or job name"
              className="h-7 text-xs"
            />
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setActiveSearch(search.trim())}>
              <Search className="mr-1 h-3.5 w-3.5" /> Search
            </Button>
            {data?.clientName && (
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setSearch(data.clientName ?? ""); setActiveSearch(data.clientName ?? ""); }}>
                Use client name
              </Button>
            )}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-neutral-500">
            Shows photos from this invoice&apos;s visits and jobs, plus photo jobs linked to this client or project. Photo jobs that were only
            created with a customer name need the search above.
          </p>

          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-neutral-500" />}
          {!isLoading && candidates.length === 0 && <p className="text-xs text-slate-400 dark:text-neutral-500">No other photos found.</p>}

          {[...groups.entries()].map(([label, list]) => (
            <div key={label}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">{label}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {list.map((c) => (
                  <label key={key(c)} className="relative block cursor-pointer overflow-hidden rounded border bg-card">
                    {c.signedUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.signedUrl} alt={c.caption ?? "Photo"} loading="lazy" className="h-20 w-full object-cover" />
                    ) : (
                      <div className="flex h-20 items-center justify-center bg-muted text-[10px] text-slate-400 dark:text-neutral-500">Unavailable</div>
                    )}
                    <Checkbox className="absolute left-1 top-1 bg-card" checked={selected.has(key(c))} onCheckedChange={() => toggle(c)} />
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end">
            <Button type="button" size="sm" className="h-7 text-xs" disabled={selected.size === 0 || attach.isPending} onClick={attachSelected}>
              {attach.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Include {selected.size || ""} selected
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
