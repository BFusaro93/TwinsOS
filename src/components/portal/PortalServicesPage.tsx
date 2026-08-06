"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Loader2, Wrench, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

interface Visit {
  id: string;
  scheduled_date: string;
  status: string;
  completed_at?: string | null;
  jobTitle: string;
  jobType: string;
}

interface Props {
  upcoming: Visit[];
  completed: Visit[];
  clientId: string;
  orgId: string;
}

const STATUS_PILL: Record<string, { label: string; color: string }> = {
  scheduled:   { label: "Scheduled",    color: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress: { label: "In Progress",  color: "bg-amber-50 text-amber-700 border-amber-200" },
  completed:   { label: "Completed",    color: "bg-green-50 text-green-700 border-green-200" },
  cancelled:   { label: "Cancelled",    color: "bg-slate-100 text-slate-500 border-slate-200" },
};

export default function PortalServicesPage({ upcoming: initialUpcoming, completed, clientId, orgId }: Props) {
  const [upcoming, setUpcoming] = useState(initialUpcoming);
  const [liveVisitId, setLiveVisitId] = useState<string | null>(
    initialUpcoming.find((v) => v.status === "in_progress")?.id ?? null
  );

  // Supabase Realtime subscription for live visit status. Note:
  // crm_job_visits isn't currently in the supabase_realtime publication
  // (confirmed via pg_publication_tables), so this never actually fires yet
  // — filtering by client_id rather than the broader org_id is still correct
  // defensively, so that if the table is ever added to the publication, this
  // subscription doesn't request every other client's visit updates in the
  // same org.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`portal-visits-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "crm_job_visits",
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; status: string; client_id?: string };
          // Only update visits that belong to this client's upcoming list
          setUpcoming((prev) =>
            prev.map((v) => v.id === updated.id ? { ...v, status: updated.status } : v)
          );
          if (updated.status === "in_progress") setLiveVisitId(updated.id);
          else if (liveVisitId === updated.id) setLiveVisitId(null);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, orgId]);

  const inProgressVisit = upcoming.find((v) => v.status === "in_progress");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">Services</h1>

      {/* Live status banner */}
      {inProgressVisit && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-amber-600 animate-spin" />
            <Zap className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">Service in Progress</p>
            <p className="text-xs text-amber-700">{inProgressVisit.jobTitle} · Your crew is on-site now</p>
          </div>
        </div>
      )}

      {/* Upcoming */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Upcoming</h2>
        {upcoming.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
            No upcoming visits scheduled.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((v) => {
              const pill = STATUS_PILL[v.status] ?? STATUS_PILL.scheduled;
              const isLive = v.status === "in_progress";
              return (
                <li
                  key={v.id}
                  className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-3 transition ${isLive ? "border-amber-300 shadow-sm" : "border-slate-200"}`}
                >
                  <div className={`flex flex-col items-center justify-center w-10 h-10 rounded-lg shrink-0 ${isLive ? "bg-amber-50 text-amber-600" : "bg-brand-50 text-brand-700"}`}>
                    {isLive ? <Wrench className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{v.jobTitle}</p>
                    <p className="text-xs text-slate-500">{fmtDate(v.scheduled_date)}</p>
                  </div>
                  <span className={`text-xs border rounded-full px-2 py-0.5 capitalize shrink-0 ${pill.color}`}>
                    {isLive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 mr-1 align-middle animate-pulse" />}
                    {pill.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Completed */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Completed</h2>
        {completed.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
            No completed visits yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {completed.map((v) => (
              <li key={v.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
                <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-slate-50 shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{v.jobTitle}</p>
                  <p className="text-xs text-slate-500">{fmtDate(v.scheduled_date)}</p>
                </div>
                <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                  Completed
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
