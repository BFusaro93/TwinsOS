"use client";

import Link from "next/link";
import { Ticket, ClipboardSignature, Receipt, UserRound, Plus, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useCurrentUserStore } from "@/stores";
import { useTickets } from "@/lib/hooks/use-tickets";
import { useEstimates } from "@/lib/hooks/use-estimates";
import { useInvoices } from "@/lib/hooks/use-invoices";
import { useClients } from "@/lib/hooks/use-clients";
import { usePendingSequenceApprovals } from "@/lib/hooks/use-sequence-approvals";
import type { EstimateStage } from "@/types/crm-estimates";
import type { InvoiceStatus } from "@/types/crm-invoices";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { RevenueSnapshot } from "@/components/crm/reports/RevenueSnapshot";

const STAGE_COLOR: Record<EstimateStage, string> = {
  draft:    "bg-slate-100 text-slate-600",
  quote:    "bg-blue-100 text-blue-700",
  sent:     "bg-yellow-100 text-yellow-700",
  accepted: "bg-green-100 text-green-700",
  lost:     "bg-red-100 text-red-600",
  invoiced: "bg-teal-100 text-teal-700",
};

const INVOICE_STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft:   "bg-slate-100 text-slate-600",
  printed: "bg-indigo-100 text-indigo-700",
  sent:    "bg-blue-100 text-blue-700",
  viewed:  "bg-purple-100 text-purple-700",
  partial: "bg-yellow-100 text-yellow-700",
  paid:    "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-600",
  void:    "bg-slate-100 text-slate-400",
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getTodayLong(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between pb-2 border-b">
      <span className="text-sm font-semibold text-slate-700">{title}</span>
      <Link href={href} className="text-xs text-brand-500 hover:text-brand-600">
        View all →
      </Link>
    </div>
  );
}

export function MyDay() {
  const { currentUser } = useCurrentUserStore();
  const firstName = currentUser.name.split(" ")[0];

  const { data: openTickets, isLoading: ticketsLoading } = useTickets({ status: "open" });
  const { data: allEstimates, isLoading: estimatesLoading } = useEstimates();
  const { data: allInvoices, isLoading: invoicesLoading } = useInvoices();
  const { data: allClients, isLoading: clientsLoading } = useClients();
  const { data: pendingApprovals, isLoading: approvalsLoading } = usePendingSequenceApprovals();

  const today = new Date().toISOString().split("T")[0];
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const overdueCount = (openTickets ?? []).filter(
    (t) => t.dueDate && t.dueDate < today
  ).length;

  const pendingEstimates = (allEstimates ?? []).filter((e) =>
    ["draft", "quote", "sent"].includes(e.stage)
  );
  const pipelineValueCents = pendingEstimates.reduce((s, e) => s + e.totalCents, 0);

  const outstandingInvoices = (allInvoices ?? []).filter((i) => i.balanceCents > 0);
  const totalBalanceCents = outstandingInvoices.reduce((s, i) => s + i.balanceCents, 0);

  const activeClients = (allClients ?? []).filter((c) => c.status === "active");
  const newThisMonth = activeClients.filter(
    (c) => c.createdAt >= startOfMonth
  ).length;

  const recentTickets = (openTickets ?? []).slice(0, 5);
  const recentEstimates = (allEstimates ?? []).slice(0, 5);
  const topOutstandingInvoices = [...outstandingInvoices]
    .sort((a, b) => b.balanceCents - a.balanceCents)
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-4 p-6 min-h-full">
      {/* Greeting bar */}
      <div className="flex items-center justify-between rounded-lg border bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{getTodayLong()}</p>
        </div>
        <Link
          href="/crm/tickets"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Ticket
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* Open Tickets */}
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Open Tickets</span>
            <Ticket className="h-4 w-4 text-orange-400" />
          </div>
          {ticketsLoading ? (
            <Skeleton className="h-8 w-16 mb-1" />
          ) : (
            <p className="text-3xl font-bold text-slate-900">{(openTickets ?? []).length}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            {ticketsLoading ? <Skeleton className="h-3 w-20" /> : `${overdueCount} overdue`}
          </p>
        </div>

        {/* Pending Estimates */}
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Pending Estimates</span>
            <ClipboardSignature className="h-4 w-4 text-blue-400" />
          </div>
          {estimatesLoading ? (
            <Skeleton className="h-8 w-16 mb-1" />
          ) : (
            <p className="text-3xl font-bold text-slate-900">{pendingEstimates.length}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            {estimatesLoading ? (
              <Skeleton className="h-3 w-24" />
            ) : (
              `${formatCurrency(pipelineValueCents)} pipeline`
            )}
          </p>
        </div>

        {/* Outstanding Invoices */}
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Outstanding Invoices</span>
            <Receipt className="h-4 w-4 text-red-400" />
          </div>
          {invoicesLoading ? (
            <Skeleton className="h-8 w-16 mb-1" />
          ) : (
            <p className="text-3xl font-bold text-slate-900">{outstandingInvoices.length}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            {invoicesLoading ? (
              <Skeleton className="h-3 w-24" />
            ) : (
              `${formatCurrency(totalBalanceCents)} outstanding`
            )}
          </p>
        </div>

        {/* Active Clients */}
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Active Clients</span>
            <UserRound className="h-4 w-4 text-green-400" />
          </div>
          {clientsLoading ? (
            <Skeleton className="h-8 w-16 mb-1" />
          ) : (
            <p className="text-3xl font-bold text-slate-900">{activeClients.length}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            {clientsLoading ? (
              <Skeleton className="h-3 w-24" />
            ) : (
              `${newThisMonth} added this month`
            )}
          </p>
        </div>
      </div>

      <RevenueSnapshot />

      {/* Two-column content */}
      <div className="grid grid-cols-[3fr_2fr] gap-4 flex-1">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Open Tickets */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <SectionHeader title="Open Tickets" href="/crm/tickets?status=open" />
            <div className="mt-3">
              {ticketsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 border-b py-2.5 last:border-0">
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))
              ) : recentTickets.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  No open tickets — you&apos;re all caught up!
                </p>
              ) : (
                recentTickets.map((t) => (
                  <Link
                    key={t.id}
                    href="/crm/tickets"
                    className="flex items-center gap-3 border-b py-2.5 last:border-0 hover:bg-slate-50 -mx-4 px-4 transition-colors"
                  >
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">
                      #{t.ticketNumber}
                    </span>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-600 shrink-0">
                      Open
                    </span>
                    <span className="flex-1 truncate text-sm text-slate-700">
                      {t.subject ?? "(no subject)"}
                    </span>
                    {t.clientName && (
                      <span className="text-xs text-blue-600 shrink-0 max-w-[120px] truncate">
                        {t.clientName}
                      </span>
                    )}
                    {t.category && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 shrink-0">
                        {t.category}
                      </span>
                    )}
                    {t.dueDate && (
                      <span className={cn(
                        "text-[11px] shrink-0",
                        t.dueDate < today ? "text-red-500 font-medium" : "text-slate-400"
                      )}>
                        {formatDate(t.dueDate)}
                      </span>
                    )}
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Recent Estimates */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <SectionHeader title="Recent Estimates" href="/crm/estimates" />
            <div className="mt-3">
              {estimatesLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 border-b py-2.5 last:border-0">
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))
              ) : recentEstimates.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No estimates yet</p>
              ) : (
                recentEstimates.map((e) => (
                  <Link
                    key={e.id}
                    href={`/crm/estimates/${e.id}`}
                    className="flex items-center gap-3 border-b py-2.5 last:border-0 hover:bg-slate-50 -mx-4 px-4 transition-colors"
                  >
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">
                      #{e.estimateNumber}
                    </span>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize shrink-0",
                      STAGE_COLOR[e.stage]
                    )}>
                      {e.stage}
                    </span>
                    <span className="flex-1 truncate text-sm text-slate-700">
                      {e.description || "(no description)"}
                    </span>
                    {e.clientName && (
                      <span className="text-xs text-blue-600 shrink-0 max-w-[120px] truncate">
                        {e.clientName}
                      </span>
                    )}
                    <span className="text-sm font-medium text-slate-700 shrink-0">
                      {e.totalCents > 0 ? formatCurrency(e.totalCents) : "—"}
                    </span>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {formatDate(e.estimateDate)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Automations Pending Approval */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <SectionHeader title="Automations Pending Approval" href="/crm/communication/automations" />
            <div className="mt-3">
              {approvalsLoading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 border-b py-2.5 last:border-0">
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))
              ) : (pendingApprovals ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  Nothing waiting on approval.
                </p>
              ) : (
                pendingApprovals!.slice(0, 5).map((a) => (
                  <Link
                    key={a.id}
                    href="/crm/communication/automations"
                    className="flex items-center gap-3 border-b py-2.5 last:border-0 hover:bg-slate-50 -mx-4 px-4 transition-colors"
                  >
                    <Inbox className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="flex-1 truncate text-sm text-slate-700">
                      {a.subject}
                    </span>
                    {a.clientName && (
                      <span className="text-xs text-blue-600 shrink-0 max-w-[120px] truncate">
                        {a.clientName}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {formatDate(a.createdAt)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Outstanding Invoices */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <SectionHeader title="Outstanding Invoices" href="/crm/accounting/invoices" />
            <div className="mt-3">
              {invoicesLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 border-b py-2.5 last:border-0">
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))
              ) : topOutstandingInvoices.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No outstanding invoices</p>
              ) : (
                topOutstandingInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/crm/accounting/invoices/${inv.id}`}
                    className="flex flex-col gap-0.5 border-b py-2.5 last:border-0 hover:bg-slate-50 -mx-4 px-4 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-slate-400">
                        #{inv.invoiceNumber}
                      </span>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                        INVOICE_STATUS_COLOR[inv.status]
                      )}>
                        {inv.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-700 truncate">
                        {inv.clientName ?? "—"}
                      </span>
                      <span className="text-sm font-semibold text-red-500 shrink-0">
                        {formatCurrency(inv.balanceCents)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400">
                        Total: {formatCurrency(inv.totalCents)}
                      </span>
                      {inv.dueDate && (
                        <span className="text-[11px] text-slate-400">
                          Due {formatDate(inv.dueDate)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 pb-2 border-b mb-3">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2">
              <PermissionGate permission="client_add">
                <Link
                  href="/crm/clients"
                  className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <UserRound className="h-4 w-4 text-green-500" />
                  New Client
                </Link>
              </PermissionGate>
              <Link
                href="/crm/estimates"
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ClipboardSignature className="h-4 w-4 text-blue-500" />
                New Estimate
              </Link>
              <Link
                href="/crm/tickets"
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Ticket className="h-4 w-4 text-orange-500" />
                New Ticket
              </Link>
              <Link
                href="/crm/accounting/invoices"
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Receipt className="h-4 w-4 text-red-500" />
                New Invoice
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
