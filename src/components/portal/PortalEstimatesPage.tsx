"use client";

import { useState } from "react";
import { FileText, Clock, CheckCircle2, XCircle, Loader2, Download, MessageSquarePlus } from "lucide-react";
import { groupIntoSections, DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from "@/lib/estimate-display-settings";
import { looksLikeHtml } from "@/lib/utils/sanitize-html";
import { stripHtml } from "@/lib/utils/strip-html";
import { SubAccountLabel } from "@/components/portal/SubAccountLabel";
import { deriveProposalTotals, proposalLineNet } from "@/lib/estimates/proposal-totals";

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtDate(iso: string) {
  // Date-only values (valid until) must not go through UTC parsing, which
  // shifts them a day earlier for US viewers.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso.slice(0, 10)) && iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  sent:     { label: "Awaiting Review", color: "bg-blue-50 text-blue-700 border-blue-200",    icon: <Clock className="h-3.5 w-3.5" /> },
  viewed:   { label: "Viewed",          color: "bg-yellow-50 text-yellow-700 border-yellow-200", icon: <Clock className="h-3.5 w-3.5" /> },
  accepted: { label: "Accepted",        color: "bg-green-50 text-green-700 border-green-200", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  invoiced: { label: "Accepted",        color: "bg-green-50 text-green-700 border-green-200", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  // The office moves an accepted estimate to 'won' when converting it to a job.
  won:      { label: "Accepted",        color: "bg-green-50 text-green-700 border-green-200", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  // A declined proposal is stored as stage 'lost' (the office's term); the
  // client-facing wording stays "Declined". 'declined' is kept for any legacy rows.
  lost:     { label: "Declined",        color: "bg-slate-100 text-slate-500 border-slate-200", icon: <XCircle className="h-3.5 w-3.5" /> },
  declined: { label: "Declined",        color: "bg-slate-100 text-slate-500 border-slate-200", icon: <XCircle className="h-3.5 w-3.5" /> },
  expired:  { label: "Expired",         color: "bg-red-50 text-red-600 border-red-200",       icon: <XCircle className="h-3.5 w-3.5" /> },
};

interface Estimate {
  id: string;
  estimate_number: string;
  title: string | null;
  total_price_cents: number;
  status: string;
  expires_at: string | null;
  created_at: string;
  /** Set when the estimate is for one of the login's sub-accounts. */
  accountName?: string | null;
  display_settings?: DisplaySettings;
  /** Good/Better/Best estimate: the client accepts exactly one tier. */
  tiers_enabled?: boolean;
  tier_labels?: { basic: string; standard: string; premium: string };
  /** Header discount / tax of the version shown — the Selected Total applies
   *  them exactly as accepting does (lib/estimates/proposal-totals). */
  discount_cents?: number | null;
  discount_type?: "percent" | "flat" | null;
  discount_value?: number | null;
  tax_rate_bps?: number | null;
  line_items?: LineItem[];
  /** Deposit the estimate asks for (of the version shown). */
  deposit_required_cents?: number | null;
  /** A required deposit still owed on an ACCEPTED estimate (0 = none). */
  deposit_due_cents?: number;
  /** The proposal link to pay it online, when one exists. */
  deposit_pay_url?: string | null;
}

const TIERS = ["basic", "standard", "premium"] as const;
type Tier = (typeof TIERS)[number];

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  /** The line's real total (qty × rate × visits), before its own discount. */
  total_cents: number;
  /** The line's own discount, and its priced sub-items. */
  discount_cents?: number | null;
  subitem_total_cents?: number | null;
  visits?: number | null;
  status: string;
  row_type?: "item" | "section" | null;
  section_name?: string | null;
  tier?: string | null;
  package_id?: string | null;
}

interface SignDialogProps {
  estimate: Estimate;
  onClose: () => void;
  onAccepted: (id: string, depositDueCents: number) => void;
}

function SignDialog({ estimate, onClose, onAccepted }: SignDialogProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settings = estimate.display_settings ?? DEFAULT_DISPLAY_SETTINGS;
  const openRows = (estimate.line_items ?? []).filter((li) => li.status !== "lost" && li.status !== "draft");
  // Lines accepted earlier ('won'): shown as already agreed, never offered
  // again, and always part of the total (the stored total counts them).
  const agreedRows = openRows.filter((li) => li.status === "won" && li.row_type !== "section");
  const allItemRows = openRows.filter((li) => li.row_type !== "section" && li.status !== "won");
  // Tiered estimate: the client picks ONE package, and only untiered lines
  // plus that package's lines are offered (matching the public proposal page).
  const tiersEnabled = !!estimate.tiers_enabled && allItemRows.some((li) => li.tier != null);
  const tierLabels = estimate.tier_labels ?? { basic: "Basic", standard: "Standard", premium: "Premium" };
  const availableTiers = TIERS.filter((t) => allItemRows.some((li) => li.tier === t));
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const inTier = (li: LineItem) => !tiersEnabled || li.tier == null || li.tier === selectedTier;
  const itemRows = allItemRows.filter(inTier);
  const hasLineItems = itemRows.length > 0;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(allItemRows.map((li) => li.id)));

  // A package is all-or-nothing: toggling one of its lines flips them all.
  function toggleItem(id: string) {
    const pkgId = allItemRows.find((li) => li.id === id)?.package_id ?? null;
    const ids = pkgId ? allItemRows.filter((li) => li.package_id === pkgId).map((li) => li.id) : [id];
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const on = !next.has(id);
      for (const x of ids) { if (on) next.add(x); else next.delete(x); }
      return next;
    });
  }

  // What accepting records: each line's net (own discount, sub-items), plus
  // the already-agreed lines, then the header discount and tax — the same
  // rule as the public proposal page and recalcEstimateTotals.
  const lineNet = (li: LineItem) =>
    proposalLineNet({ totalCents: li.total_cents, discountCents: li.discount_cents, subitemTotalCents: li.subitem_total_cents });
  const agreedNet = agreedRows.reduce((sum, li) => sum + lineNet(li), 0);
  const totalsFor = (subtotal: number) =>
    deriveProposalTotals(
      {
        discountCents: estimate.discount_cents ?? 0,
        discountType: estimate.discount_type ?? null,
        discountValue: estimate.discount_value ?? null,
        taxRateBps: estimate.tax_rate_bps ?? 0,
      },
      agreedNet + subtotal,
    ).totalCents;

  const tierTotal = (tier: Tier) =>
    totalsFor(allItemRows.filter((li) => li.tier == null || li.tier === tier).reduce((sum, li) => sum + lineNet(li), 0));

  const selectedTotal = hasLineItems
    ? totalsFor(itemRows.filter((li) => selectedIds.has(li.id)).reduce((sum, li) => sum + lineNet(li), 0))
    : estimate.total_price_cents;

  const sections = groupIntoSections(
    openRows
      .filter((li) => li.status !== "won" && (li.row_type === "section" || inTier(li)))
      // total_cents, not rate × qty: rate × qty ignored visits, so a 13-visit
      // mow at $55 read $55 (and the Selected Total followed) instead of $715.
      .map((li) => ({ ...li, totalCents: li.total_cents, rowType: li.row_type ?? "item", sectionName: li.section_name ?? null, estimateDesc: li.description, packageId: li.package_id ?? null })),
    settings
  );

  async function handleAccept() {
    if (!name.trim()) { setError("Please type your full name to sign."); return; }
    if (tiersEnabled && !selectedTier) { setError("Please choose a package."); return; }
    const acceptedIds = itemRows.filter((li) => selectedIds.has(li.id)).map((li) => li.id);
    if (hasLineItems && acceptedIds.length === 0) { setError("Please select at least one item to accept."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/estimates/${estimate.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          signatureName: name.trim(),
          acceptedLineItemIds: hasLineItems ? acceptedIds : undefined,
          selectedTier: tiersEnabled ? selectedTier ?? undefined : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Something went wrong.");
        return;
      }
      const required = estimate.deposit_required_cents ?? 0;
      onAccepted(estimate.id, required > 0 ? Math.min(required, selectedTotal > 0 ? selectedTotal : required) : 0);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-5 p-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Accept Estimate</h2>
          <p className="text-sm text-slate-500 mt-1">
            {estimate.title ?? `Estimate #${estimate.estimate_number}`} · {fmt(estimate.total_price_cents)}
          </p>
          {estimate.accountName && (
            <p className="text-xs text-slate-500 mt-1">For {estimate.accountName}</p>
          )}
        </div>

        {tiersEnabled && (
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">Choose your package</p>
            <div className="grid grid-cols-3 gap-2">
              {availableTiers.map((tier) => {
                const isSelected = selectedTier === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setSelectedTier(tier)}
                    className={`rounded-lg border-2 p-2.5 text-left transition ${isSelected ? "border-brand-500 bg-green-50/60" : "border-slate-200 hover:border-slate-300"}`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tierLabels[tier]}</p>
                    <p className="text-sm font-bold text-slate-800">{fmt(tierTotal(tier))}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Per-item selection — uncheck anything you don't want to accept */}
        {hasLineItems && (!tiersEnabled || selectedTier) && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 text-sm max-h-64 overflow-y-auto">
            {sections.map((section, si) => section.packageId && section.items.length > 0 ? (
              // A package is one main line with ONE checkbox (all-or-nothing); its
              // visits, when shown, are plain rows underneath.
              <div key={si} className="border-b border-slate-100 last:border-b-0">
                <label
                  className={`flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors ${section.items.every((li) => selectedIds.has(li.id)) ? "bg-green-50/60" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={section.items.every((li) => selectedIds.has(li.id))}
                    onChange={() => toggleItem(section.items[0].id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 cursor-pointer accent-brand-500"
                  />
                  <span className="text-slate-700 flex-1 min-w-0">
                    <span className="font-medium">{section.sectionName}</span>
                    {section.description && (
                      <span className="block text-xs text-slate-500">
                        {looksLikeHtml(section.description) ? stripHtml(section.description) : section.description}
                      </span>
                    )}
                  </span>
                  {settings.showLineTotals && <span className="text-slate-800 font-medium shrink-0">{fmt(section.subtotalCents)}</span>}
                </label>
                {settings.showPackageVisits && (
                  <ul className="bg-white/60">
                    {section.items.map((li) => (
                      <li key={li.id} className="flex items-baseline justify-between gap-3 py-1.5 pl-9 pr-3 text-xs text-slate-500">
                        <span className="min-w-0 truncate">
                          {looksLikeHtml(li.description) ? stripHtml(li.description) : li.description}
                        </span>
                        {settings.showLineTotals && <span className="shrink-0">{fmt(li.total_cents)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div key={si}>
                {section.sectionName && (
                  <div className="bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {section.sectionName}
                  </div>
                )}
                <div className="divide-y divide-slate-100">
                  {section.items.map((li) => (
                    <label
                      key={li.id}
                      className={`flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors ${selectedIds.has(li.id) ? "bg-green-50/60" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(li.id)}
                        onChange={() => toggleItem(li.id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 cursor-pointer accent-brand-500"
                      />
                      <span className="text-slate-700 flex-1 min-w-0">
                        {/* estimate_desc is rich text, so it usually arrives as
                            an HTML fragment. This line is inline (a quantity
                            suffix sits beside it), so flatten to text rather
                            than rendering a block — otherwise the customer
                            reads the raw "<p>" tags. */}
                        {looksLikeHtml(li.description) ? stripHtml(li.description) : li.description}
                        {settings.showQuantities && li.quantity > 1 && <span className="text-slate-400 text-xs ml-1">×{li.quantity}</span>}
                        {(li.visits ?? 1) > 1 && <span className="text-slate-400 text-xs ml-1">· {li.visits} visits</span>}
                      </span>
                      {settings.showLineTotals && !(settings.hideZeroPrices && li.unit_price_cents === 0) && (
                        <span className="text-slate-800 font-medium shrink-0">{fmt(li.total_cents)}</span>
                      )}
                    </label>
                  ))}
                </div>
                {section.sectionName && settings.showSectionSubtotals && (
                  <div className="flex justify-end bg-slate-100/60 px-3 py-1.5 text-xs font-medium text-slate-600">
                    Subtotal: {fmt(section.subtotalCents)}
                  </div>
                )}
              </div>
            ))}
            {agreedRows.length > 0 && (
              <div className="border-t border-slate-200">
                <div className="bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Already agreed
                </div>
                <div className="divide-y divide-slate-100">
                  {agreedRows.map((li) => (
                    <div key={li.id} className="flex items-start gap-2.5 px-3 py-2 text-slate-500">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <span className="flex-1 min-w-0">
                        {looksLikeHtml(li.description) ? stripHtml(li.description) : li.description}
                      </span>
                      {settings.showLineTotals && <span className="shrink-0">{fmt(lineNet(li))}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 font-semibold">
              <span className="text-slate-900">Selected Total</span>
              <span className="text-slate-900">{fmt(selectedTotal)}</span>
            </div>
          </div>
        )}

        {(estimate.deposit_required_cents ?? 0) > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A deposit of {fmt(Math.min(estimate.deposit_required_cents ?? 0, selectedTotal > 0 ? selectedTotal : (estimate.deposit_required_cents ?? 0)))} is
            due to confirm this work. You can accept now and pay it afterwards.
          </p>
        )}

        <div>
          <p className="text-xs text-slate-500 mb-2">
            By typing your full name below you agree to {hasLineItems ? "the items you've selected above" : "the services described in this estimate"}. This acts as your electronic signature.
          </p>
          <input
            type="text"
            placeholder="Type your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            style={{ fontFamily: "cursive" }}
          />
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAccept}
            disabled={loading || !name.trim() || (tiersEnabled && !selectedTier)}
            className="flex-1 h-10 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Accept & Sign
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeclineDialogProps {
  estimate: Estimate;
  onClose: () => void;
  onDeclined: (id: string) => void;
}

function DeclineDialog({ estimate, onClose, onDeclined }: DeclineDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDecline() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/estimates/${estimate.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decline" }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Something went wrong.");
        return;
      }
      onDeclined(estimate.id);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col gap-5 p-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Decline Estimate?</h2>
          <p className="text-sm text-slate-500 mt-1">
            {estimate.title ?? `Estimate #${estimate.estimate_number}`}
          </p>
          <p className="text-sm text-slate-600 mt-3">
            Declining will notify our team. You can always reach out to discuss adjustments.
          </p>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Keep Open
          </button>
          <button
            onClick={handleDecline}
            disabled={loading}
            className="flex-1 h-10 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

interface RequestChangesDialogProps {
  estimate: Estimate;
  onClose: () => void;
  onSent: () => void;
}

function RequestChangesDialog({ estimate, onClose, onSent }: RequestChangesDialogProps) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!message.trim()) { setError("Please describe what you'd like changed."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/estimates/${estimate.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_changes", message: message.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Something went wrong.");
        return;
      }
      onSent();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-5 p-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Request Changes</h2>
          <p className="text-sm text-slate-500 mt-1">
            {estimate.title ?? `Estimate #${estimate.estimate_number}`}
          </p>
        </div>

        <div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="e.g. Can we swap the mulch for stone edging on the front bed?"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={loading || !message.trim()}
            className="flex-1 h-10 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Send Request
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PortalEstimatesPage({ estimates: initial, today }: { estimates: Estimate[]; today: string }) {
  const [estimates, setEstimates] = useState(initial);
  const [signing, setSigning] = useState<Estimate | null>(null);
  const [declining, setDeclining] = useState<Estimate | null>(null);
  const [requestingChanges, setRequestingChanges] = useState<Estimate | null>(null);
  const [changesSentFor, setChangesSentFor] = useState<string | null>(null);

  function patchStatus(id: string, status: string) {
    setEstimates((prev) => prev.map((e) => e.id === id ? { ...e, status } : e));
    setSigning(null);
    setDeclining(null);
  }

  const open = estimates.filter((e) => ["sent", "viewed"].includes(e.status));
  const closed = estimates.filter((e) => !["sent", "viewed"].includes(e.status));

  function renderList(list: Estimate[], actionable: boolean) {
    return (
      <ul className="flex flex-col gap-2">
        {list.map((est) => {
          const cfg = STATUS_CONFIG[est.status] ?? STATUS_CONFIG.sent;
          // Only an estimate still awaiting a decision can expire — a decided
          // one (accepted/invoiced/declined) keeps its outcome badge.
          const decided = ["accepted", "invoiced", "won", "lost", "declined"].includes(est.status);
          const expired = est.expires_at && est.expires_at.slice(0, 10) < today && !decided;
          const displayStatus = expired ? STATUS_CONFIG.expired : cfg;
          const canAct = actionable && !expired;

          return (
            <li key={est.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-50 shrink-0 mt-0.5">
                <FileText className="h-5 w-5 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {est.title ?? `Estimate #${est.estimate_number}`}
                </p>
                <SubAccountLabel name={est.accountName} />
                <p className="text-xs text-slate-500">
                  Sent {fmtDate(est.created_at)}
                  {est.expires_at && !["accepted", "lost", "invoiced", "won"].includes(est.status) && (
                    <> · Expires {fmtDate(est.expires_at)}</>
                  )}
                </p>

                {/* Action buttons for open estimates */}
                {canAct && (
                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      onClick={() => setSigning(est)}
                      className="h-7 px-3 rounded-md bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 transition"
                    >
                      Review & Accept
                    </button>
                    <button
                      onClick={() => setDeclining(est)}
                      className="h-7 px-3 rounded-md border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition"
                    >
                      Decline
                    </button>
                    {changesSentFor === est.id ? (
                      <span className="text-xs text-green-700 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Request sent
                      </span>
                    ) : (
                      <button
                        onClick={() => setRequestingChanges(est)}
                        className="h-7 px-3 rounded-md border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition flex items-center gap-1"
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" /> Request Changes
                      </button>
                    )}
                  </div>
                )}

                {/* Signature confirmation */}
                {est.status === "accepted" && (
                  <p className="text-xs text-green-700 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Accepted — signed electronically
                  </p>
                )}
                {/* A required deposit not paid yet. Accepting never waits on
                    it, but it stays visible here until it's paid. */}
                {(est.deposit_due_cents ?? 0) > 0 && (
                  <p className="text-xs text-amber-700 mt-1.5">
                    Deposit due: <strong>{fmt(est.deposit_due_cents ?? 0)}</strong>
                    {est.deposit_pay_url ? (
                      <>
                        {" · "}
                        <a href={est.deposit_pay_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                          Pay online
                        </a>
                      </>
                    ) : (
                      " — we'll be in touch about payment"
                    )}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="text-sm font-semibold text-slate-900">{fmt(est.total_price_cents)}</span>
                <span className={`flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${displayStatus.color}`}>
                  {displayStatus.icon}
                  {displayStatus.label}
                </span>
                <div className="flex items-center gap-3">
                  <a
                    href={`/api/portal/estimates/${est.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                  >
                    <FileText className="h-3 w-3" />
                    View PDF
                  </a>
                  <a
                    href={`/api/portal/estimates/${est.id}/pdf?download=1`}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                  >
                    <Download className="h-3 w-3" />
                    Download
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">Estimates</h1>

      {estimates.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
          No estimates on file.
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Pending Review</h2>
              {renderList(open, true)}
            </section>
          )}
          {closed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">History</h2>
              {renderList(closed, false)}
            </section>
          )}
        </>
      )}

      {signing && (
        <SignDialog
          estimate={signing}
          onClose={() => setSigning(null)}
          onAccepted={(id, depositDueCents) => {
            patchStatus(id, "accepted");
            setEstimates((prev) => prev.map((e) => (e.id === id ? { ...e, deposit_due_cents: depositDueCents } : e)));
          }}
        />
      )}
      {declining && (
        <DeclineDialog
          estimate={declining}
          onClose={() => setDeclining(null)}
          onDeclined={(id) => patchStatus(id, "lost")}
        />
      )}
      {requestingChanges && (
        <RequestChangesDialog
          estimate={requestingChanges}
          onClose={() => setRequestingChanges(null)}
          onSent={() => {
            setChangesSentFor(requestingChanges.id);
            setRequestingChanges(null);
          }}
        />
      )}
    </div>
  );
}
