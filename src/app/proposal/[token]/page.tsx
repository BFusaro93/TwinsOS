"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2, MessageSquarePlus } from "lucide-react";
import type { ProposalData, ProposalLineItem } from "@/types/crm-proposals";
import { groupIntoSections, type DisplaySettings } from "@/lib/estimate-display-settings";

function cents(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

// Meta line combining visit count / qty (gated by showQuantities) and the
// per-visit rate (gated by showLinePrices, with hideZeroPrices suppressing
// just the rate when it's $0 rather than dropping the whole row).
function lineMeta(li: ProposalLineItem, settings: DisplaySettings): string | null {
  const parts: string[] = [];
  if (settings.showQuantities) {
    if (li.visits > 1) parts.push(`${li.visits} visits`);
    if (li.qty > 1) parts.push(`${li.qty.toLocaleString()} ${li.unitType ?? ""}`.trim());
  }
  if (settings.showLinePrices && !(settings.hideZeroPrices && li.rateCents === 0)) {
    parts.push(`${cents(li.rateCents)}/visit`);
  }
  return parts.length ? parts.join(" × ") : null;
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

// ── Request changes ────────────────────────────────────────────────────────────

function RequestChangesSection({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || !message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/proposals/${token}/request-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterName: name.trim(), message: message.trim() }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to send request");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-brand-500" />
        <p className="mt-2 text-sm font-medium text-slate-700">Thanks — we&apos;ve received your request.</p>
        <p className="mt-1 text-xs text-slate-500">Our team will follow up with you shortly.</p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="text-center">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 underline underline-offset-2"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Need something changed? Request changes
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-800">Request Changes</h2>
        <p className="text-sm text-slate-500 mt-1">
          Let us know what you&apos;d like adjusted and we&apos;ll follow up before you accept.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rc-name">Your Name <span className="text-red-500">*</span></Label>
        <Input
          id="rc-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rc-message">What would you like changed? <span className="text-red-500">*</span></Label>
        <Textarea
          id="rc-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="e.g. Can we swap the mulch for stone edging on the front bed?"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={submitting}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={!name.trim() || !message.trim() || submitting}
          onClick={handleSubmit}
        >
          {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : "Send Request"}
        </Button>
      </div>
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
  const [selectedTier, setSelectedTier] = useState<'basic' | 'standard' | 'premium'>('standard');
  const [acceptedByName, setAcceptedByName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Deposit step state
  const [depositStep, setDepositStep] = useState<'idle' | 'deposit' | 'done'>('idle');
  const [depositMethod, setDepositMethod] = useState<'cash' | 'check' | 'ach' | 'credit_card' | 'other' | null>(null);
  const [depositReference, setDepositReference] = useState("");
  const [depositNotes, setDepositNotes] = useState("");
  // Pending accept payload — held while deposit step is shown
  const [pendingAcceptPayload, setPendingAcceptPayload] = useState<{
    acceptedByName: string;
    signatureData?: string;
    acceptedLineItemIds?: string[];
    selectedTier?: string;
  } | null>(null);

  // Load proposal
  useEffect(() => {
    fetch(`/api/public/proposals/${token}`)
      .then((r) => r.json())
      .then((data: ProposalData & { error?: string }) => {
        if (data.error) { setError(data.error); return; }
        setProposal(data);
        // Pre-select all quote line items
        setSelectedIds(new Set(data.lineItems.filter((li) => li.rowType !== "section").map((li) => li.id)));
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

  // When tiers enabled, filter items by selected tier (null = all tiers, or matching tier)
  const visibleLineItems = proposal
    ? proposal.tiersEnabled
      ? proposal.lineItems.filter((li) => li.rowType === "section" || li.tier === null || li.tier === selectedTier)
      : proposal.lineItems
    : [];

  const sections = proposal ? groupIntoSections(visibleLineItems, proposal.displaySettings) : [];

  // Live subtotal from visible items (tier-filtered) or selected items (checkbox mode)
  const selectedTotal = proposal?.tiersEnabled
    ? visibleLineItems.filter((li) => li.rowType !== "section").reduce((sum, li) => sum + li.totalCents, 0)
    : (proposal?.lineItems
        .filter((li) => li.rowType !== "section" && selectedIds.has(li.id))
        .reduce((sum, li) => sum + li.totalCents, 0) ?? 0);

  const taxAmount = proposal
    ? Math.round(selectedTotal * (proposal.taxRateBps / 10000))
    : 0;

  async function submitAccept(extraDepositFields?: {
    depositMethod?: 'cash' | 'check' | 'ach' | 'credit_card' | 'other';
    depositReference?: string;
    depositNotes?: string;
    depositAmount?: number;
  }) {
    const payload = pendingAcceptPayload ?? {
      acceptedByName: acceptedByName.trim(),
      signatureData: signatureData ?? undefined,
      acceptedLineItemIds: proposal?.tiersEnabled ? undefined : Array.from(selectedIds),
      selectedTier: proposal?.tiersEnabled ? selectedTier : undefined,
    };
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/proposals/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, ...extraDepositFields }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to accept");
      }
      setDepositStep('done');
      setAccepted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAccept() {
    if (!acceptedByName.trim()) return;

    // If deposit is required and not yet collected, show the deposit step
    if (
      proposal &&
      proposal.depositRequiredCents > 0 &&
      proposal.depositCollectedCents === 0 &&
      depositStep === 'idle'
    ) {
      setPendingAcceptPayload({
        acceptedByName: acceptedByName.trim(),
        signatureData: signatureData ?? undefined,
        acceptedLineItemIds: proposal.tiersEnabled ? undefined : Array.from(selectedIds),
        selectedTier: proposal.tiersEnabled ? selectedTier : undefined,
      });
      setDepositStep('deposit');
      return;
    }

    await submitAccept();
  }

  async function handleDepositSubmit() {
    if (!depositMethod) return;
    await submitAccept({
      depositMethod,
      depositReference: depositReference.trim() || undefined,
      depositNotes: depositNotes.trim() || undefined,
      depositAmount: proposal?.depositRequiredCents,
    });
  }

  async function handleDepositSkip() {
    await submitAccept();
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

      {/* Tier selector — only shown when tiersEnabled */}
      {proposal.tiersEnabled && (
        <div className="mb-6">
          <p className="mb-3 text-sm font-semibold text-slate-700">Choose Your Package</p>
          <div className="grid grid-cols-3 gap-3">
            {(["basic", "standard", "premium"] as const).map((tier) => {
              const label = proposal.tierLabels[tier];
              const tierItems = proposal.lineItems.filter((li) => li.rowType !== "section" && (li.tier === null || li.tier === tier));
              const tierTotal = tierItems.reduce((s, li) => s + li.totalCents, 0);
              const isSelected = selectedTier === tier;
              return (
                <button
                  key={tier}
                  onClick={() => setSelectedTier(tier)}
                  className={`rounded-lg border-2 p-4 text-left transition-all ${
                    isSelected ? "shadow-md" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                  style={isSelected ? { borderColor: brand, backgroundColor: brand + "08" } : {}}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-800">{cents(tierTotal)}</p>
                  {isSelected && (
                    <p className="mt-1 text-[10px] font-medium" style={{ color: brand }}>Selected ✓</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Line items */}
      <div className="mb-6 rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ backgroundColor: brand }}>
          <p className="text-sm font-semibold text-white">Services Included</p>
          {!proposal.tiersEnabled && (
            <p className="text-xs text-white/70">Check the services you&apos;d like to include</p>
          )}
        </div>
        {sections.map((section, si) => (
          <div key={si}>
            {section.sectionName && (
              <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 border-b">
                {section.sectionName}
              </div>
            )}
            <div className="divide-y">
              {section.items.map((li: ProposalLineItem) => {
                const meta = lineMeta(li, proposal.displaySettings);
                return proposal.tiersEnabled ? (
                  <div key={li.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800">{li.serviceName ?? "Service"}</p>
                        {li.tier === null && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">Included in all</span>
                        )}
                      </div>
                      {li.estimateDesc && (
                        <p
                          className="mt-0.5 text-sm text-slate-500"
                          dangerouslySetInnerHTML={{ __html: li.estimateDesc }}
                        />
                      )}
                      {meta && <p className="mt-1 text-xs text-slate-400">{meta}</p>}
                    </div>
                    {proposal.displaySettings.showLineTotals && (
                      <p className="shrink-0 font-semibold text-slate-700">{cents(li.totalCents)}</p>
                    )}
                  </div>
                ) : (
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
                      {meta && <p className="mt-1 text-xs text-slate-400">{meta}</p>}
                    </div>
                    {proposal.displaySettings.showLineTotals && (
                      <p className="shrink-0 font-semibold text-slate-700">{cents(li.totalCents)}</p>
                    )}
                  </label>
                );
              })}
            </div>
            {section.sectionName && proposal.displaySettings.showSectionSubtotals && (
              <div className="flex justify-end bg-slate-50/60 px-4 py-2 text-sm font-medium text-slate-600 border-b">
                Subtotal: {cents(section.subtotalCents)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="mb-8 flex justify-end">
        <div className="w-64 space-y-1.5 rounded-lg border bg-white p-4 shadow-sm text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span><span className="font-medium">{cents(selectedTotal)}</span>
          </div>
          {proposal.showDiscounts && proposal.discountCents > 0 && (
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

      {/* Photos */}
      {proposal.photos.length > 0 && (
        <div className="mb-8 rounded-lg border bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Photos</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {proposal.photos.map((photo) => (
              <div key={photo.id} className="overflow-hidden rounded-lg border bg-slate-50">
                {photo.signedUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.signedUrl}
                    alt={photo.caption ?? ""}
                    className="aspect-square w-full object-cover"
                  />
                )}
                {photo.caption && (
                  <p className="px-2 py-1.5 text-center text-xs text-slate-500">{photo.caption}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deposit step — shown instead of accept section when deposit is required */}
      {depositStep === 'deposit' && proposal && (
        <div className="rounded-lg border bg-white p-6 shadow-sm space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Deposit Required</h2>
            <p className="text-sm text-slate-500 mt-1">
              {cents(proposal.depositRequiredCents)} due to confirm your project
            </p>
          </div>

          <div className="space-y-2">
            <Label>Payment Method</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(["check", "cash", "ach", "credit_card", "other"] as const).map((method) => (
                <label
                  key={method}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-all ${
                    depositMethod === method
                      ? "border-2 font-medium"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                  style={depositMethod === method ? { borderColor: brand, backgroundColor: brand + "08", color: brand } : {}}
                >
                  <input
                    type="radio"
                    name="depositMethod"
                    value={method}
                    checked={depositMethod === method}
                    onChange={() => setDepositMethod(method)}
                    className="sr-only"
                  />
                  {{
                    check: "Check",
                    cash: "Cash",
                    ach: "ACH",
                    credit_card: "Credit Card",
                    other: "Other",
                  }[method]}
                </label>
              ))}
              {/* Stripe placeholder */}
              <div className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-400">
                Pay with Card
                <span className="ml-1 rounded bg-slate-200 px-1 py-0.5 text-[10px] text-slate-500">coming soon</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deposit-reference">Reference # <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Input
              id="deposit-reference"
              value={depositReference}
              onChange={(e) => setDepositReference(e.target.value)}
              placeholder="Check number, transaction ID, etc."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deposit-notes">Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Input
              id="deposit-notes"
              value={depositNotes}
              onChange={(e) => setDepositNotes(e.target.value)}
              placeholder="Any additional notes"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <Button
              className="flex-1 h-11 text-base font-semibold"
              style={{ backgroundColor: brand, borderColor: brand }}
              disabled={!depositMethod || submitting}
              onClick={handleDepositSubmit}
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
              ) : (
                "Submit Deposit & Accept"
              )}
            </Button>
            <Button
              variant="outline"
              className="h-11 px-5"
              disabled={submitting}
              onClick={handleDepositSkip}
            >
              Skip for now
            </Button>
          </div>
        </div>
      )}

      {/* Accept section */}
      {depositStep === 'idle' && (
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
          disabled={!acceptedByName.trim() || submitting || (!proposal.tiersEnabled && selectedIds.size === 0)}
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
      )}

      {/* Request changes */}
      {depositStep === 'idle' && (
        <RequestChangesSection token={token} />
      )}

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-slate-400">
        <p>{proposal.orgName}{proposal.orgPhone ? ` · ${proposal.orgPhone}` : ""}</p>
      </div>
    </div>
  );
}
