"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
  MessageSquarePlus,
  Receipt,
  Sparkles,
  Wrench,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { describeVisitWindow } from "@/lib/portal/visit-window";

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", opts);
}

/** Whole days from `today` to `iso`, both YYYY-MM-DD on the org's calendar. */
function daysBetween(today: string, iso: string) {
  return Math.round(
    (Date.parse(iso + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000
  );
}

function relativeDay(today: string, iso: string) {
  const d = daysBetween(today, iso);
  if (d <= 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 7) return `In ${d} days`;
  if (d < 14) return "Next week";
  return `In ${Math.floor(d / 7)} weeks`;
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
  jobDetail?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
}

/** When a visit happens — a service window for package / waiting-list
 *  visits (their date is only the window's start), else a relative day. */
function whenLabel(v: Visit, today: string) {
  if (v.status === "in_progress") return "In progress";
  if (v.windowStart && v.windowEnd) return describeVisitWindow(v.windowStart, v.windowEnd, today);
  return relativeDay(today, v.scheduled_date);
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
  recentVisits: Visit[];
  estimates: Estimate[];
  today: string;
  allowTickets: boolean;
  allowEstimates: boolean;
  clientId: string;
  orgId: string;
}

export default function PortalDashboard({
  greeting,
  balanceCents,
  creditsCents,
  invoices,
  upcomingVisits: initialVisits,
  recentVisits,
  estimates,
  today,
  allowTickets,
  allowEstimates,
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
  const nextVisit = inProgressVisit ?? upcomingVisits[0];
  // YYYY-MM-DD strings compare correctly; comparing Date objects would parse
  // due_date as UTC midnight and flip a day early in US timezones.
  const isPastDue = (inv: Invoice) => !!inv.due_date && inv.due_date < today;
  const isOverdue = invoices.some((i) => i.status === "overdue" || isPastDue(i));

  const quickActions = [
    { label: balanceCents > 0 ? "Pay balance" : "Billing", href: "/portal/billing", icon: CreditCard, show: true },
    { label: "My schedule", href: "/portal/services", icon: CalendarDays, show: true },
    { label: "Request service", href: "/portal/tickets", icon: MessageSquarePlus, show: allowTickets },
    { label: "Estimates", href: "/portal/estimates", icon: FileText, show: allowEstimates },
  ].filter((a) => a.show);

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-500 px-6 py-7 text-white shadow-sm sm:px-8">
        {/* Decorative contour rings */}
        <svg
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 text-white/10"
          viewBox="0 0 200 200"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="100" cy="100" r="40" />
          <circle cx="100" cy="100" r="60" />
          <circle cx="100" cy="100" r="80" />
          <circle cx="100" cy="100" r="98" />
        </svg>

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{greeting}</h1>
              <p className="mt-1 text-sm text-white/80">
                {balanceCents > 0
                  ? `You have ${fmt(balanceCents)} due on your account.`
                  : "Your account is all caught up. Thanks for being a great customer!"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickActions.map(({ label, href, icon: Icon }, i) => (
                <a
                  key={href}
                  href={href}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition ${
                    i === 0 && balanceCents > 0
                      ? "bg-white text-brand-800 hover:bg-brand-50"
                      : "bg-white/15 text-white ring-1 ring-inset ring-white/25 hover:bg-white/25"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </a>
              ))}
            </div>
          </div>

          {/* Next visit */}
          <div className="w-full shrink-0 rounded-xl bg-white/10 p-4 ring-1 ring-inset ring-white/20 backdrop-blur-sm lg:w-72">
            {nextVisit ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                  {nextVisit.status === "in_progress" ? "Happening now" : "Next visit"}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <DateTile visit={nextVisit} today={today} tone="hero" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{nextVisit.jobTitle}</p>
                    {nextVisit.jobDetail && (
                      <p className="truncate text-xs text-white/70">{nextVisit.jobDetail}</p>
                    )}
                    <p className="text-sm text-white/80">
                      {nextVisit.status === "in_progress"
                        ? "Your crew is on-site"
                        : whenLabel(nextVisit, today)}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Next visit</p>
                <p className="mt-2 text-sm text-white/80">Nothing on the schedule right now.</p>
              </>
            )}
          </div>
        </div>
      </section>

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
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${allowEstimates ? "lg:grid-cols-3" : ""}`}>
        {/* Balance */}
        <Card
          title="Balance Due"
          icon={isOverdue ? AlertCircle : CreditCard}
          tone={isOverdue ? "red" : "brand"}
          className={isOverdue ? "border-red-200" : undefined}
        >
          <p className={`text-3xl font-bold tracking-tight ${balanceCents > 0 ? (isOverdue ? "text-red-600" : "text-slate-900") : "text-slate-900"}`}>
            {fmt(balanceCents)}
          </p>
          {creditsCents > 0 && (
            <p className="text-xs font-medium text-brand-600">Credits on account: {fmt(creditsCents)}</p>
          )}
          {balanceCents > 0 ? (
            <a
              href="/portal/billing"
              className="mt-auto inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-medium text-white transition hover:bg-brand-600"
            >
              Pay Now
            </a>
          ) : (
            <p className="mt-auto flex items-center gap-1.5 text-sm text-slate-500">
              <CheckCircle2 className="h-4 w-4 text-brand-500" />
              No payments due
            </p>
          )}
        </Card>

        {/* Upcoming */}
        <Card title="Upcoming Service" icon={CalendarDays} tone="sky">
          {upcomingVisits.length === 0 ? (
            <p className="text-sm text-slate-400">No upcoming visits scheduled.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {upcomingVisits.slice(0, 3).map((v) => (
                <li key={v.id} className="flex items-center gap-3">
                  <DateTile visit={v} today={today} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{v.jobTitle}</p>
                    <p className="truncate text-xs text-slate-500">
                      {whenLabel(v, today)}
                      {v.jobDetail && ` · ${v.jobDetail}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <CardLink href="/portal/services">View all services</CardLink>
        </Card>

        {/* Estimates */}
        {allowEstimates && (
          <Card title="Open Estimates" icon={FileText} tone="violet">
            {estimates.length === 0 ? (
              <p className="text-sm text-slate-400">No open estimates.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {estimates.map((est) => (
                  <li key={est.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-700">{est.title ?? `Est. #${est.estimate_number}`}</span>
                    <span className="shrink-0 font-semibold text-slate-900">{fmt(est.total_price_cents)}</span>
                  </li>
                ))}
              </ul>
            )}
            <CardLink href="/portal/estimates">View estimates</CardLink>
          </Card>
        )}
      </div>

      {/* Invoices + recent service */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Receipt className="h-4 w-4 text-slate-400" />
              Outstanding Invoices
            </h2>
            <a href="/portal/billing" className="text-xs font-medium text-brand-600 hover:underline">View all</a>
          </div>
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50">
                <Sparkles className="h-5 w-5 text-brand-500" />
              </div>
              <p className="text-sm font-medium text-slate-800">You&apos;re all caught up</p>
              <p className="text-xs text-slate-500">No outstanding invoices on your account.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {invoices.map((inv) => {
                const pastDue = isPastDue(inv);
                return (
                  <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800">Invoice #{inv.invoice_number}</p>
                      <p className={`text-xs ${pastDue ? "font-medium text-red-600" : "text-slate-500"}`}>
                        {inv.due_date ? `${pastDue ? "Past due" : "Due"} ${fmtDate(inv.due_date)}` : "No due date"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-900">{fmt(inv.balance_cents)}</span>
                      <a
                        href="/portal/billing"
                        className="flex h-8 items-center rounded-lg bg-brand-500 px-3.5 text-xs font-medium text-white transition hover:bg-brand-600"
                      >
                        Pay
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-slate-400" />
              Recent Service
            </h2>
            <a href="/portal/services" className="text-xs font-medium text-brand-600 hover:underline">History</a>
          </div>
          {recentVisits.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">No completed visits yet.</p>
          ) : (
            <ol className="relative px-5 py-4">
              {recentVisits.map((v, i) => (
                <li key={v.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < recentVisits.length - 1 && (
                    <span aria-hidden className="absolute left-[9px] top-5 h-full w-px bg-slate-200" />
                  )}
                  <span className="relative mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-brand-100">
                    <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{v.jobTitle}</p>
                    <p className="truncate text-xs text-slate-500">
                      Completed {fmtDate(v.scheduled_date)}
                      {v.jobDetail && ` · ${v.jobDetail}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

const TONES = {
  brand: "bg-brand-50 text-brand-600",
  red: "bg-red-50 text-red-600",
  sky: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
} as const;

function Card({
  title,
  icon: Icon,
  tone,
  className,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{title}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONES[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {children}
    </div>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="group mt-auto inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
      {children}
      <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
    </a>
  );
}

function DateTile({ visit, today, tone = "default" }: { visit: Visit; today: string; tone?: "default" | "hero" }) {
  // A windowed visit whose window has opened shows its deadline, not a
  // start date that's already behind us.
  const open = !!visit.windowStart && !!visit.windowEnd && visit.windowStart <= today;
  const iso = open ? visit.windowEnd! : visit.windowStart ?? visit.scheduled_date;
  return (
    <div
      className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg leading-none ${
        tone === "hero" ? "bg-white text-brand-800" : "bg-slate-100 text-slate-700"
      }`}
    >
      <span className="text-[10px] font-semibold uppercase">
        {open ? "By" : fmtDate(iso, { month: "short" })}
      </span>
      <span className="mt-0.5 text-base font-bold">
        {open ? fmtDate(iso, { month: "numeric", day: "numeric" }) : fmtDate(iso, { day: "numeric" })}
      </span>
    </div>
  );
}
