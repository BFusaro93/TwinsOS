"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, GripVertical } from "lucide-react";
import { useClients } from "@/lib/hooks/use-clients";
import { useCreateInvoice, useDeleteInvoice } from "@/lib/hooks/use-invoices";
import { InvoiceDetail } from "./InvoiceDetail";
import { ClientCombobox } from "@/components/shared/ClientCombobox";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultClientId?: string;
}

const MIN_WIDTH = 480;

export function NewInvoiceSheet({ open, onClose, defaultClientId }: Props) {
  // Lazy-initialized on mount (not at module scope) so it reflects the
  // actual viewport instead of whatever window.innerWidth was when this
  // chunk first happened to be evaluated.
  const [width, setWidth] = useState(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1100;
    return Math.min(vw, Math.max(MIN_WIDTH, Math.min(1100, vw * 0.75)));
  });
  const [canResize] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [draftClientId, setDraftClientId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);
  const savedRef = useRef(false);
  // Guards the auto-create effect against firing twice for one open (React
  // StrictMode double-invokes effects in dev, and a parent re-render before
  // setInvoiceId lands would otherwise start a second insert) — each extra
  // run left a stray empty draft behind (D-23).
  const creatingRef = useRef(false);

  const { data: clients } = useClients();
  const invoiceableClients = (clients ?? []).filter((c) => c.status !== "lead");
  const { mutateAsync: createInvoice } = useCreateInvoice();
  const { mutateAsync: deleteInvoice } = useDeleteInvoice();

  // Auto-create a draft (no invoice number assigned yet) when a client is known
  useEffect(() => {
    if (open && defaultClientId && !invoiceId && !creatingRef.current) {
      creatingRef.current = true;
      setCreating(true);
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      createInvoice({ clientId: defaultClientId, description: "", invoiceDate: today })
        .then((inv) => { setInvoiceId(inv.id); setDraftClientId(defaultClientId); })
        .catch(() => toast.error("Failed to create invoice"))
        .finally(() => { setCreating(false); creatingRef.current = false; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultClientId]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setInvoiceId(null);
      setDraftClientId(null);
      setCreating(false);
      savedRef.current = false;
      creatingRef.current = false;
    }
  }, [open]);

  // Any way the sheet closes with an unsaved draft still open discards it,
  // so the invoice number is never consumed by a record the user abandoned.
  // The draft row is inserted as soon as a client is known (InvoiceDetail
  // needs a real id to edit against), so this soft-delete is what keeps
  // abandoned sheets from leaving empty drafts in the Invoices list (D-23).
  // Routed through every close path: backdrop, X, Escape, AND InvoiceDetail's
  // own close button (which previously called the raw onClose and skipped it).
  function handleClose() {
    if (invoiceId && draftClientId && !savedRef.current) {
      deleteInvoice({ id: invoiceId, clientId: draftClientId }).catch(() => {});
    }
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") handleClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, draftClientId]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      const next = Math.max(MIN_WIDTH, Math.min(window.innerWidth - 40, startW.current + delta));
      setWidth(next);
    }
    function onMouseUp() {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function startDrag(e: React.MouseEvent) {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  }

  async function handleSelectClient(clientId: string) {
    if (creatingRef.current || invoiceId) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const inv = await createInvoice({ clientId, description: "", invoiceDate: today });
      setInvoiceId(inv.id);
      setDraftClientId(clientId);
    } catch {
      toast.error("Failed to create invoice");
    } finally {
      setCreating(false);
      creatingRef.current = false;
    }
  }

  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={handleClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 flex shadow-2xl max-w-[100vw]" style={{ width }}>
        {/* Drag handle + close */}
        <div
          className={`flex w-8 flex-col items-center bg-slate-100 hover:bg-slate-200 transition-colors flex-shrink-0 border-r border-slate-200 ${canResize ? "cursor-ew-resize" : ""}`}
          onMouseDown={canResize ? startDrag : undefined}
        >
          <button
            className="mt-3 rounded p-1 text-slate-400 hover:bg-slate-300 hover:text-slate-700 transition-colors cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleClose}
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
          {canResize && (
            <div className="flex flex-1 items-center">
              <GripVertical className="h-4 w-4 text-slate-300" />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden bg-white">
          {invoiceId ? (
            // Full InvoiceDetail — same UI as opening any existing invoice.
            // onSaved marks the draft as kept; onDiscard soft-deletes it if closed unsaved.
            <InvoiceDetail
              invoiceId={invoiceId}
              onClose={handleClose}
              onSaved={() => { savedRef.current = true; }}
              onDiscard={onClose}
            />
          ) : (
            /* Client picker — shown when no defaultClientId */
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-3 border-b bg-slate-50 px-6 py-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">New Invoice</h2>
                  <p className="text-xs text-slate-400">Select a client to get started</p>
                </div>
              </div>

              <div className="px-8 py-6 grid grid-cols-2 gap-5">
                <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Bill To</p>
                  <ClientCombobox
                    value=""
                    onValueChange={handleSelectClient}
                    clients={invoiceableClients}
                    noneLabel="Search clients..."
                    disabled={creating}
                  />
                  {creating && (
                    <p className="text-xs text-slate-400 animate-pulse">Creating invoice…</p>
                  )}
                </div>

                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 flex items-center justify-center">
                  <p className="text-xs text-slate-300">Invoice details will appear after selecting a client</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
