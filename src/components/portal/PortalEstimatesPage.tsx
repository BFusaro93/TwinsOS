"use client";

import { useState } from "react";
import { FileText, Clock, CheckCircle2, XCircle, Loader2, Download } from "lucide-react";

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  sent:     { label: "Awaiting Review", color: "bg-blue-50 text-blue-700 border-blue-200",    icon: <Clock className="h-3.5 w-3.5" /> },
  viewed:   { label: "Viewed",          color: "bg-yellow-50 text-yellow-700 border-yellow-200", icon: <Clock className="h-3.5 w-3.5" /> },
  accepted: { label: "Accepted",        color: "bg-green-50 text-green-700 border-green-200", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
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
  line_items?: LineItem[];
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
}

interface SignDialogProps {
  estimate: Estimate;
  onClose: () => void;
  onAccepted: (id: string) => void;
}

function SignDialog({ estimate, onClose, onAccepted }: SignDialogProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    if (!name.trim()) { setError("Please type your full name to sign."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/estimates/${estimate.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept", signatureName: name.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Something went wrong.");
        return;
      }
      onAccepted(estimate.id);
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
        </div>

        {/* Line items summary if available */}
        {estimate.line_items && estimate.line_items.length > 0 && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
            {estimate.line_items.map((li) => (
              <div key={li.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-slate-700 truncate flex-1">{li.description}</span>
                <span className="text-slate-500 text-xs ml-2 shrink-0">×{li.quantity}</span>
                <span className="text-slate-800 font-medium ml-3 shrink-0">{fmt(li.unit_price_cents * li.quantity)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 font-semibold">
              <span className="text-slate-900">Total</span>
              <span className="text-slate-900">{fmt(estimate.total_price_cents)}</span>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-slate-500 mb-2">
            By typing your full name below you agree to the services described in this estimate. This acts as your electronic signature.
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
            disabled={loading || !name.trim()}
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

export default function PortalEstimatesPage({ estimates: initial }: { estimates: Estimate[] }) {
  const [estimates, setEstimates] = useState(initial);
  const [signing, setSigning] = useState<Estimate | null>(null);
  const [declining, setDeclining] = useState<Estimate | null>(null);

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
          const expired = est.expires_at && new Date(est.expires_at) < new Date() && est.status !== "accepted";
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
                <p className="text-xs text-slate-500">
                  Sent {fmtDate(est.created_at)}
                  {est.expires_at && !["accepted", "declined"].includes(est.status) && (
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
                  </div>
                )}

                {/* Signature confirmation */}
                {est.status === "accepted" && (
                  <p className="text-xs text-green-700 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Accepted — signed electronically
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="text-sm font-semibold text-slate-900">{fmt(est.total_price_cents)}</span>
                <span className={`flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${displayStatus.color}`}>
                  {displayStatus.icon}
                  {displayStatus.label}
                </span>
                <a
                  href={`/portal/estimates/${est.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                >
                  <Download className="h-3 w-3" />
                  PDF
                </a>
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
          onAccepted={(id) => patchStatus(id, "accepted")}
        />
      )}
      {declining && (
        <DeclineDialog
          estimate={declining}
          onClose={() => setDeclining(null)}
          onDeclined={(id) => patchStatus(id, "declined")}
        />
      )}
    </div>
  );
}
