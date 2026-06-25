"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { ProposalData, ProposalLineItem } from "@/types/crm-proposals";

function cents(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

// ── Signature pad ─────────────────────────────────────────────────────────────

function SignaturePad({ onSave }: { onSave: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const src = "touches" in e ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    drawing.current = true;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }, []);

  const endDraw = useCallback(() => {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;
    onSave(canvas.toDataURL("image/png"));
  }, [hasSignature, onSave]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", endDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", endDraw);
    return () => {
      canvas.removeEventListener("mousedown", startDraw);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", endDraw);
      canvas.removeEventListener("touchstart", startDraw);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("touchend", endDraw);
    };
  }, [startDraw, draw, endDraw]);

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSave(null);
  }

  return (
    <div className="space-y-1">
      <div className="relative rounded border border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          width={520}
          height={120}
          className="w-full touch-none rounded cursor-crosshair"
        />
        {!hasSignature && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Sign here
          </p>
        )}
      </div>
      {hasSignature && (
        <button type="button" onClick={clear} className="text-xs text-slate-400 hover:text-slate-600 underline">
          Clear signature
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProposalPage() {
  const { token } = useParams<{ token: string }>();

  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [acceptedByName, setAcceptedByName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Load proposal
  useEffect(() => {
    fetch(`/api/public/proposals/${token}`)
      .then((r) => r.json())
      .then((data: ProposalData & { error?: string }) => {
        if (data.error) { setError(data.error); return; }
        setProposal(data);
        // Pre-select all quote line items
        setSelectedIds(new Set(data.lineItems.map((li) => li.id)));
        if (data.alreadyAccepted) setAccepted(true);
      })
      .catch(() => setError("Failed to load proposal."))
      .finally(() => setLoading(false));
  }, [token]);

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Live subtotal from selected items
  const selectedTotal = proposal?.lineItems
    .filter((li) => selectedIds.has(li.id))
    .reduce((sum, li) => sum + li.totalCents, 0) ?? 0;

  const taxAmount = proposal
    ? Math.round(selectedTotal * (proposal.taxRateBps / 10000))
    : 0;

  async function handleAccept() {
    if (!acceptedByName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/proposals/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acceptedByName: acceptedByName.trim(),
          signatureData: signatureData ?? undefined,
          acceptedLineItemIds: Array.from(selectedIds),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to accept");
      }
      setAccepted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading / error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error && !accepted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold text-slate-700">{error}</p>
          <p className="mt-2 text-sm text-slate-500">If you think this is a mistake, please contact us directly.</p>
        </div>
      </div>
    );
  }

  if (!proposal) return null;

  const brand = proposal.orgBrandColor;

  // ── Accepted confirmation screen ────────────────────────────────────────────
  if (accepted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: brand + "20" }}>
            <CheckCircle2 className="h-8 w-8" style={{ color: brand }} />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-slate-800">Proposal Accepted!</h1>
          <p className="text-slate-500">
            Thank you{proposal.acceptedByName ? `, ${proposal.acceptedByName}` : ""}. We&apos;ve received your confirmation and will
            be in touch shortly to schedule your services.
          </p>
          {proposal.orgPhone && (
            <p className="mt-4 text-sm text-slate-400">
              Questions? Call us at <strong className="text-slate-600">{proposal.orgPhone}</strong>
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Main proposal view ──────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          {proposal.orgLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proposal.orgLogoUrl} alt={proposal.orgName} className="mb-3 h-12 object-contain" />
          ) : (
            <p className="mb-3 text-xl font-bold" style={{ color: brand }}>{proposal.orgName}</p>
          )}
          <h1 className="text-2xl font-bold text-slate-800">
            Estimate #{String(proposal.estimateNumber).padStart(5, "0")}
          </h1>
          {proposal.description && (
            <p className="mt-1 text-slate-500">{proposal.description}</p>
          )}
        </div>
        <div className="text-right text-sm text-slate-500">
          <p>{new Date(proposal.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
          {proposal.validUntil && (
            <p className="text-orange-500">
              Valid until {new Date(proposal.validUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>
      </div>

      {/* Prepared for */}
      {proposal.clientName && (
        <div className="mb-6 rounded-lg border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Prepared For</p>
          <p className="mt-1 text-base font-semibold text-slate-800">{proposal.clientName}</p>
        </div>
      )}

      {/* Line items */}
      <div className="mb-6 rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ backgroundColor: brand }}>
          <p className="text-sm font-semibold text-white">Services Included</p>
          <p className="text-xs text-white/70">Check the services you&apos;d like to include</p>
        </div>
        <div className="divide-y">
          {proposal.lineItems.map((li: ProposalLineItem) => (
            <label
              key={li.id}
              className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${selectedIds.has(li.id) ? "bg-green-50/50" : ""}`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(li.id)}
                onChange={() => toggleItem(li.id)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 cursor-pointer"
                style={{ accentColor: brand }}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800">{li.serviceName ?? "Service"}</p>
                {li.estimateDesc && (
                  <p
                    className="mt-0.5 text-sm text-slate-500"
                    dangerouslySetInnerHTML={{ __html: li.estimateDesc }}
                  />
                )}
                <p className="mt-1 text-xs text-slate-400">
                  {li.visits > 1 ? `${li.visits} visits × ` : ""}
                  {li.qty > 1 ? `${li.qty.toLocaleString()} ${li.unitType ?? ""} × ` : ""}
                  {cents(li.rateCents)}/visit
                </p>
              </div>
              <p className="shrink-0 font-semibold text-slate-700">{cents(li.totalCents)}</p>
            </label>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="mb-8 flex justify-end">
        <div className="w-64 space-y-1.5 rounded-lg border bg-white p-4 shadow-sm text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span><span className="font-medium">{cents(selectedTotal)}</span>
          </div>
          {proposal.discountCents > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span><span className="font-medium">-{cents(proposal.discountCents)}</span>
            </div>
          )}
          {proposal.taxRateBps > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Tax ({(proposal.taxRateBps / 100).toFixed(2)}%)</span>
              <span className="font-medium">{cents(taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-bold" style={{ color: brand }}>
            <span>Total</span>
            <span>{cents(selectedTotal + taxAmount)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {proposal.notes && (
        <div className="mb-8 rounded-lg border bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{proposal.notes}</p>
        </div>
      )}

      {/* Accept section */}
      <div className="rounded-lg border bg-white p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Accept This Proposal</h2>
          <p className="text-sm text-slate-500 mt-1">
            By signing below you agree to the services listed above. We&apos;ll be in touch to schedule.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="accept-name">Your Full Name <span className="text-red-500">*</span></Label>
          <Input
            id="accept-name"
            value={acceptedByName}
            onChange={(e) => setAcceptedByName(e.target.value)}
            placeholder="Enter your full name"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Signature</Label>
          <SignaturePad onSave={setSignatureData} />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <Button
          className="w-full h-11 text-base font-semibold"
          style={{ backgroundColor: brand, borderColor: brand }}
          disabled={!acceptedByName.trim() || submitting || selectedIds.size === 0}
          onClick={handleAccept}
        >
          {submitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
          ) : (
            `Accept Proposal — ${cents(selectedTotal + taxAmount)}`
          )}
        </Button>
        <p className="text-center text-xs text-slate-400">
          This is a legally binding acceptance. A confirmation email will be sent to you.
        </p>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-slate-400">
        <p>{proposal.orgName}{proposal.orgPhone ? ` · ${proposal.orgPhone}` : ""}</p>
      </div>
    </div>
  );
}
