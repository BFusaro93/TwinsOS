"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays, FileText, CheckCircle2, Loader2, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface Invoice {
  id: string;
  invoice_number: string;
  total_cents: number;
  balance_cents: number;
  due_date: string;
  status: string;
}

interface Visit {
  id: string;
  scheduled_date: string;
  status: string;
  jobTitle: string;
}

interface Estimate {
  id: string;
  estimate_number: string;
  title: string | null;
  total_price_cents: number;
  status: string;
  expires_at: string | null;
}

interface Props {
  greeting: string;
  balanceCents: number;
  creditsCents: number;
  invoices: Invoice[];
  upcomingVisits: Visit[];
  estimates: Estimate[];
  clientId: string;
  orgId: string;
}

export default function PortalDashboard({
  greeting,
  balanceCents,
  creditsCents,
  invoices,
  upcomingVisits: initialVisits,
  estimates,
  clientId,
  orgId,
}: Props) {
  const [upcomingVisits, setUpcomingVisits] = useState(initialVisits);

  // Subscribe to real-time visit status changes. crm_job_visits was added to
  // the supabase_realtime publication in 20260826153000_crm_job_visits_realtime.sql;
  // RLS's own portal-scoped policy (client_portal_multi_org.sql) is what
  // actually restricts delivery to this client's rows — the client_id filter
  // here is just to avoid subscribing to an unfiltered stream client-side.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`portal-dashboard-visits-${clientId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "crm_job_visits", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const updated = payload.new as { id: string; status: string };
          setUpcomingVisits((prev) =>
            prev.map((v) => v.id === updated.id ? { ...v, status: updated.status } : v)
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, orgId]);

  const inProgressVisit = upcomingVisits.find((v) => v.status === "in_progress");
  const isOverdue = invoices.some((i) => i.status === "overdue" || new Date(i.due_date) < new Date());

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{greeting}</h1>
        <p className="text-sm text-slate-500 mt-0.5">Here's a summary of your account.</p>
      </div>

      {/* Live in-progress banner */}
      {inProgressVisit && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-4 w-4 text-amber-600 animate-spin" />
            <Wrench className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">Service in Progress</p>
            <p className="text-xs text-amber-700">{inProgressVisit.jobTitle} · Your crew is on-site now</p>
          </div>
          <a href="/portal/services" className="ml-auto text-xs font-medium text-amber-700 hover:underline shrink-0">
            View details →
          </a>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Balance */}
        <div className={`bg-white rounded-xl border p-4 flex flex-col gap-2 ${isOverdue ? "border-red-200" : "border-slate-200"}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">Balance Due</span>
            {isOverdue && <AlertCircle className="h-4 w-4 text-red-500" />}
          </div>
          <p className={`text-2xl font-bold ${balanceCents > 0 ? (isOverdue ? "text-red-600" : "text-slate-900") : "text-slate-400"}`}>
            {fmt(balanceCents)}
          </p>
          {balanceCents > 0 ? (
            <a
              href="/portal/billing"
              className="mt-auto inline-flex items-center justify-center h-8 rounded-md bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 transition"
            >
              Pay Now
            </a>
          ) : (
            <p className="text-xs text-slate-400 mt-auto flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-brand-500" />
              No payments due
            </p>
          )}
          {creditsCents > 0 && (
            <p className="text-xs text-brand-600">Credits on account: {fmt(creditsCents)}</p>
          )}
        </div>

        {/* Upcoming */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">Upcoming Service</span>
            <CalendarDays className="h-4 w-4 text-slate-400" />
          </div>
          {upcomingVisits.length === 0 ? (
            <p className="text-sm text-slate-400 mt-1">No upcoming visits scheduled.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5 mt-1">
                {upcomingVisits.slice(0, 3).map((v) => (
                  <div key={v.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 truncate">{v.jobTitle}</span>
                    <span className="text-slate-500 text-xs shrink-0 ml-2">{fmtDate(v.scheduled_date)}</span>
                  </div>
                ))}
              </div>
              <a href="/portal/services" className="mt-auto text-xs text-brand-600 hover:underline">
                View all services →
              </a>
            </>
          )}
        </div>

        {/* Estimates */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">Open Estimates</span>
            <FileText className="h-4 w-4 text-slate-400" />
          </div>
          {estimates.length === 0 ? (
            <p className="text-sm text-slate-400 mt-1">No open estimates.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5 mt-1">
                {estimates.map((est) => (
                  <div key={est.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 truncate">{est.title ?? `Est. #${est.estimate_number}`}</span>
                    <span className="text-slate-800 font-medium text-xs shrink-0 ml-2">{fmt(est.total_price_cents)}</span>
                  </div>
                ))}
              </div>
              <a href="/portal/estimates" className="mt-auto text-xs text-brand-600 hover:underline">
                View estimates →
              </a>
            </>
          )}
        </div>
      </div>

      {/* Open invoices list */}
      {invoices.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Outstanding Invoices</h2>
            <a href="/portal/billing" className="text-xs text-brand-600 hover:underline">View all</a>
          </div>
          <ul className="divide-y divide-slate-100">
            {invoices.map((inv) => {
              const pastDue = new Date(inv.due_date) < new Date();
              return (
                <li key={inv.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Invoice #{inv.invoice_number}</p>
                    <p className={`text-xs ${pastDue ? "text-red-500" : "text-slate-500"}`}>
                      {pastDue ? "Past due " : "Due "}
                      {fmtDate(inv.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-900">{fmt(inv.balance_cents)}</span>
                    <a
                      href="/portal/billing"
                      className="h-7 px-3 rounded-md bg-brand-500 text-white text-xs font-medium flex items-center hover:bg-brand-600 transition"
                    >
                      Pay
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
