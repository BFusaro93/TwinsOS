"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, Pencil, Trash2, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  LineChart, Line, Legend,
} from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  useSafetyWeeks,
  useUpsertSafetyWeek,
  useDeleteSafetyWeek,
} from "@/lib/hooks/use-safety-weeks";
import type { DriverData, SafetyWeekData } from "@/lib/hooks/use-safety-weeks";

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "overview" | "history" | "import";

// ── Constants ─────────────────────────────────────────────────────────────────
const VEHICLES = [
  "Truck #7","Truck #8","Truck #10","Truck #11","Truck #12",
  "Truck #14","Truck #15","Truck #16","Truck #17","Truck #19","Truck #20",
];
const EXCLUDE_VEHICLES = new Set(["Truck #18 - Dad"]);

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreColor(s: number): string {
  if (s >= 90) return "#16a34a";
  if (s >= 75) return "#65a30d";
  if (s >= 60) return "#d97706";
  return "#dc2626";
}
function scoreTextClass(s: number): string {
  if (s >= 90) return "text-green-600";
  if (s >= 75) return "text-lime-600";
  if (s >= 60) return "text-amber-600";
  return "text-red-600";
}
function scoreBadgeClass(s: number): string {
  if (s >= 90) return "bg-green-100 text-green-700";
  if (s >= 75) return "bg-lime-100 text-lime-700";
  if (s >= 60) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}
function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}
function shortName(name: string): string {
  return name.replace("Truck ", "#");
}

// ── XLSX parser (loads xlsx from CDN on first use) ────────────────────────────
type XlsxLib = {
  read: (data: string, opts: { type: string; cellDates: boolean }) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (ws: unknown, opts: { defval: string }) => Record<string, unknown>[];
  };
};

async function parseSamsaraXlsx(file: File): Promise<DriverData[]> {
  if (!(window as { XLSX?: unknown }).XLSX) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => res();
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const lib = (window as { XLSX?: XlsxLib }).XLSX!;
  const binary = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target!.result as string);
    r.onerror = rej;
    r.readAsBinaryString(file);
  });
  const wb = lib.read(binary, { type: "binary", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = lib.utils.sheet_to_json(ws, { defval: "" });

  const col = (row: Record<string, unknown>, candidates: string[]): unknown => {
    const keys = Object.keys(row);
    for (const c of candidates) {
      const found = keys.find(k => k.toLowerCase().includes(c.toLowerCase()));
      if (found !== undefined) return row[found];
    }
    return "";
  };

  const excelTimeToHMS = (val: unknown): string => {
    if (typeof val === "number") {
      const totalSec = Math.round(val * 86400);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s2 = totalSec % 60;
      return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s2).padStart(2,"0")}`;
    }
    return String(val || "--");
  };

  return rows
    .filter(r => {
      const name = String(col(r, ["Vehicle Name", "Vehicle"]) ?? "").trim();
      const rank = col(r, ["Rank"]);
      return name && name !== "-" && rank !== "-" && !EXCLUDE_VEHICLES.has(name);
    })
    .map(r => ({
      name: String(col(r, ["Vehicle Name", "Vehicle"])).trim(),
      score: parseInt(String(col(r, ["Safety Score"]))) || 0,
      drive: excelTimeToHMS(col(r, ["Drive Time"])),
      miles: parseFloat(String(col(r, ["Total Distance"]))) || 0,
      events: parseInt(String(col(r, ["Total Events", "Total Behaviors"]))) || 0,
    }));
}

// ── Shared small components ───────────────────────────────────────────────────
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function Td({ children, right, cls }: { children: React.ReactNode; right?: boolean; cls?: string }) {
  return (
    <td className={`px-4 py-3 text-sm ${right ? "text-right tabular-nums" : ""} ${cls ?? ""}`}>
      {children}
    </td>
  );
}
function KpiCard({
  label, value, sub, cls,
}: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${cls ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SafetyDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [viewWeekEnd, setViewWeekEnd] = useState<string | null>(null);

  // Import state
  const [importLabel, setImportLabel] = useState("");
  const [importWeekEnd, setImportWeekEnd] = useState("");
  const [xlsxSt, setXlsxSt] = useState("");
  const [uploadedDrivers, setUploadedDrivers] = useState<DriverData[]>([]);
  const [pendingDrivers, setPendingDrivers] = useState<DriverData[]>([]);
  const [importMode, setImportMode] = useState<"upload" | "manual">("upload");

  // Manual entry fields
  const [manVehicle, setManVehicle] = useState("");
  const [manScore, setManScore] = useState("");
  const [manDrive, setManDrive] = useState("");
  const [manMiles, setManMiles] = useState("");
  const [manEvents, setManEvents] = useState("0");

  const fileRef = useRef<HTMLInputElement>(null);

  const { data: weeks = [], isLoading } = useSafetyWeeks();
  const upsert = useUpsertSafetyWeek();
  const del = useDeleteSafetyWeek();

  // Determine which week to display
  const curWeek = weeks.find(w => w.weekEnd === viewWeekEnd) ?? weeks[weeks.length - 1] ?? null;
  const curIdx = curWeek ? weeks.indexOf(curWeek) : -1;
  const prevWeek = curIdx > 0 ? weeks[curIdx - 1] : null;

  // File upload handler
  const handleFile = useCallback(async (file: File) => {
    setXlsxSt("Parsing…");
    setUploadedDrivers([]);
    try {
      const drivers = await parseSamsaraXlsx(file);
      if (!drivers.length) throw new Error("No driver rows found in file");
      setUploadedDrivers(drivers);
      setXlsxSt(`✓ ${drivers.length} drivers found`);
    } catch (e) {
      setXlsxSt("Error: " + String(e));
    }
  }, []);

  // Save week
  const saveWeek = async (drivers: DriverData[]) => {
    if (!importWeekEnd || !importLabel.trim()) {
      alert("Please fill in both the Week Label and Week End date.");
      return;
    }
    try {
      const data: SafetyWeekData = { label: importLabel.trim(), drivers };
      await upsert.mutateAsync({ weekEnd: importWeekEnd, data });
      setViewWeekEnd(importWeekEnd);
      setTab("overview");
      setImportLabel("");
      setImportWeekEnd("");
      setUploadedDrivers([]);
      setXlsxSt("");
      setPendingDrivers([]);
    } catch (e) {
      alert("Save failed: " + String(e));
    }
  };

  // Add manual entry to pending list
  const addManualEntry = () => {
    if (!manVehicle || !manScore) return;
    const score = parseInt(manScore);
    if (isNaN(score) || score < 0 || score > 100) { alert("Score must be 0–100"); return; }
    setPendingDrivers(p => [
      ...p,
      { name: manVehicle, score, drive: manDrive || "--", miles: parseFloat(manMiles) || 0, events: parseInt(manEvents) || 0 },
    ]);
    setManVehicle(""); setManScore(""); setManDrive(""); setManMiles(""); setManEvents("0");
  };

  // ── OVERVIEW ───────────────────────────────────────────────────────────────
  function Overview() {
    if (!weeks.length) return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 py-16 text-center">
        <ShieldCheck className="mb-3 h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-500">No safety data yet</p>
        <p className="mt-1 text-xs text-slate-400">Import a week to get started</p>
        <button onClick={() => setTab("import")} className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
          Import Week
        </button>
      </div>
    );

    const drivers = (curWeek?.data.drivers ?? [])
      .filter(d => !EXCLUDE_VEHICLES.has(d.name))
      .sort((a, b) => b.score - a.score);

    const prevDrivers = prevWeek?.data.drivers ?? [];
    const avg = drivers.length ? Math.round(drivers.reduce((s, d) => s + d.score, 0) / drivers.length) : 0;
    const prevAvg = prevDrivers.length ? Math.round(prevDrivers.reduce((s, d) => s + d.score, 0) / prevDrivers.length) : null;
    const avgDelta = prevAvg !== null ? avg - prevAvg : null;
    const perfect = drivers.filter(d => d.score === 100).length;
    const attn = drivers.filter(d => d.score < 75);
    const totalMiles = drivers.reduce((s, d) => s + (d.miles || 0), 0);

    // Comparison chart data
    const compareData = drivers.map(d => {
      const prev = prevDrivers.find(p => p.name === d.name);
      return { name: shortName(d.name), current: d.score, previous: prev?.score ?? null };
    });

    // Score bar data for the current-week bar chart
    const scoreBarData = [...drivers].map(d => ({ name: shortName(d.name), score: d.score }));

    return (
      <div className="flex flex-col gap-6">
        {/* Week selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Week:</span>
          {weeks.map(w => (
            <button
              key={w.weekEnd}
              onClick={() => setViewWeekEnd(w.weekEnd)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${w.weekEnd === curWeek?.weekEnd ? "bg-brand-500 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {w.data.label || fmtDate(w.weekEnd)}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => {
                if (!curWeek) return;
                setImportLabel(curWeek.data.label);
                setImportWeekEnd(curWeek.weekEnd);
                setPendingDrivers([...curWeek.data.drivers]);
                setImportMode("manual");
                setTab("import");
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
            >
              <Pencil className="h-3 w-3" /> Edit Week
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Fleet Avg Score"
            value={avg > 0 ? String(avg) : "—"}
            sub={avgDelta !== null ? `${avgDelta >= 0 ? "▲" : "▼"} ${Math.abs(avgDelta)} pts vs last week` : undefined}
            cls={avg > 0 ? scoreTextClass(avg) : "text-slate-400"}
          />
          <KpiCard
            label="Perfect 100s"
            value={String(perfect)}
            sub={`of ${drivers.length} vehicles`}
            cls={perfect > 0 ? "text-green-600" : "text-slate-400"}
          />
          <KpiCard
            label="Needs Attention"
            value={String(attn.length)}
            sub={attn.length > 0 ? attn.map(d => shortName(d.name)).join(", ") : "All vehicles on track"}
            cls={attn.length > 0 ? "text-red-600" : "text-green-600"}
          />
          <KpiCard
            label="Total Miles"
            value={totalMiles > 0 ? totalMiles.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "—"}
            sub="this week"
          />
        </div>

        {/* Driver Rankings table */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Driver Rankings</p>
          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Vehicle</Th>
                  <Th>Safety Score</Th>
                  <Th right>vs Last Week</Th>
                  <Th right>Drive Time</Th>
                  <Th right>Miles</Th>
                  <Th right>Events</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drivers.map((d, i) => {
                  const prev = prevDrivers.find(p => p.name === d.name);
                  const delta = prev !== undefined ? d.score - prev.score : null;
                  return (
                    <tr key={d.name} className="hover:bg-slate-50">
                      <Td>
                        <div className="flex items-center gap-2 font-medium">
                          <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-200 text-slate-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"}`}>
                            {i + 1}
                          </span>
                          {d.name}
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full"
                              style={{ width: `${d.score}%`, backgroundColor: scoreColor(d.score) }}
                            />
                          </div>
                          <span className={`w-9 text-right text-sm font-bold tabular-nums ${scoreTextClass(d.score)}`}>
                            {d.score}
                          </span>
                        </div>
                      </Td>
                      <Td right>
                        {delta === null ? (
                          <span className="text-slate-300">—</span>
                        ) : delta === 0 ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">same</span>
                        ) : (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${delta > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
                          </span>
                        )}
                      </Td>
                      <Td right cls="text-slate-500">{d.drive}</Td>
                      <Td right cls="text-slate-500">{d.miles ? d.miles.toLocaleString() : "—"}</Td>
                      <Td right>
                        {d.events > 0 ? (
                          <span className="flex items-center justify-end gap-1">
                            {Array.from({ length: Math.min(d.events, 5) }).map((_, j) => (
                              <span key={j} className="inline-block h-2 w-2 rounded-full bg-red-500" />
                            ))}
                            <span className="ml-1 text-xs font-semibold text-red-600">{d.events}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Score comparison - this week vs last */}
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-slate-700">Score Comparison — This Week vs Last</p>
            <div className="mb-4 flex gap-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-400" />Last Week</div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-500" />This Week</div>
            </div>
            <div className="flex flex-col gap-3">
              {compareData.map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-8 text-right text-xs text-slate-500">{d.name}</span>
                  <div className="flex flex-1 flex-col gap-1">
                    {d.previous !== null && (
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-blue-400 opacity-70" style={{ width: `${d.previous}%` }} />
                      </div>
                    )}
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-brand-500" style={{ width: `${d.current}%` }} />
                    </div>
                  </div>
                  <span className={`w-8 text-right text-xs font-bold ${scoreTextClass(d.current)}`}>{d.current}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Current week scores bar chart */}
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm font-semibold text-slate-700">Current Week Scores</p>
            <ResponsiveContainer width="100%" height={Math.max(180, drivers.length * 28)}>
              <BarChart data={scoreBarData} layout="vertical" margin={{ left: 8, right: 32, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={32} />
                <Tooltip formatter={(v: number) => [v, "Score"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {scoreBarData.map((d, i) => (
                    <Cell key={i} fill={scoreColor(d.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // ── HISTORY ─────────────────────────────────────────────────────────────────
  function History() {
    if (weeks.length < 2) return (
      <div className="py-16 text-center text-sm text-slate-400">
        Import at least 2 weeks to see trends.
      </div>
    );

    const trendData = weeks.map(w => {
      const drivers = (w.data.drivers ?? []).filter(d => !EXCLUDE_VEHICLES.has(d.name));
      const avg = drivers.length ? Math.round(drivers.reduce((s, d) => s + d.score, 0) / drivers.length) : 0;
      const perfect = drivers.filter(d => d.score === 100).length;
      const attn = drivers.filter(d => d.score < 75).length;
      return { week: w.data.label || fmtDate(w.weekEnd), avg, perfect, attn };
    });

    // Per-truck trend data
    const allTrucks = [...new Set(weeks.flatMap(w => w.data.drivers.map(d => d.name)))].filter(n => !EXCLUDE_VEHICLES.has(n)).sort();
    const truckTrendData = weeks.map(w => {
      const row: Record<string, string | number> = { week: w.data.label || fmtDate(w.weekEnd) };
      w.data.drivers.forEach(d => { if (!EXCLUDE_VEHICLES.has(d.name)) row[d.name] = d.score; });
      return row;
    });
    const TRUCK_COLORS = ["#3b82f6","#60ab45","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#14b8a6","#f97316","#a3e635","#94a3b8"];

    return (
      <div className="flex flex-col gap-6">
        {/* Fleet avg trend */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-slate-700">Fleet Average Safety Score — Trend</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="avg" name="Fleet Avg" stroke="#60ab45" strokeWidth={2.5} dot={{ fill: "#60ab45", r: 4 }} />
              <Line type="monotone" dataKey="perfect" name="Perfect 100s" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6", r: 3 }} strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Per-truck trend */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-slate-700">Score by Vehicle — All Weeks</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={truckTrendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => shortName(v)} />
              {allTrucks.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} name={name} stroke={TRUCK_COLORS[i % TRUCK_COLORS.length]} strokeWidth={1.5} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly log table */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Weekly Log</p>
          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Week</Th><Th right>Fleet Avg</Th><Th right>Perfect 100s</Th><Th right>Needs Attention</Th><Th>{""}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...weeks].reverse().map(w => {
                  const drivers = (w.data.drivers ?? []).filter(d => !EXCLUDE_VEHICLES.has(d.name));
                  const avg = drivers.length ? Math.round(drivers.reduce((s, d) => s + d.score, 0) / drivers.length) : 0;
                  const perfect = drivers.filter(d => d.score === 100).length;
                  const attn = drivers.filter(d => d.score < 75).length;
                  return (
                    <tr key={w.weekEnd} className="hover:bg-slate-50">
                      <td className="py-3 pl-4 font-medium">{w.data.label || fmtDate(w.weekEnd)}</td>
                      <Td right>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBadgeClass(avg)}`}>{avg}</span>
                      </Td>
                      <Td right cls="text-green-600 font-semibold">{perfect}</Td>
                      <Td right cls={attn > 0 ? "text-red-600 font-semibold" : "text-slate-400"}>{attn > 0 ? attn : "—"}</Td>
                      <td className="px-4 py-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => {
                              setImportLabel(w.data.label);
                              setImportWeekEnd(w.weekEnd);
                              setPendingDrivers([...w.data.drivers]);
                              setImportMode("manual");
                              setTab("import");
                            }}
                            className="text-slate-400 hover:text-brand-600"
                            title="Edit week"
                          ><Pencil className="h-4 w-4" /></button>
                          <button
                            onClick={() => { if (confirm("Delete " + (w.data.label || fmtDate(w.weekEnd)) + "?")) del.mutate(w.weekEnd); }}
                            className="text-red-400 hover:text-red-600"
                          ><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────────
  function Import() {
    return (
      <div className="flex flex-col gap-5">
        {/* Week metadata */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <p className="mb-1 text-sm font-semibold text-slate-700">Week Info</p>
          <p className="mb-4 text-xs text-slate-400">Give this week a label (shown on charts) and set the end date (used for sorting).</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Week Label</label>
              <input
                type="text"
                placeholder="e.g. Mar 22–29"
                value={importLabel}
                onChange={e => setImportLabel(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Week End Date</label>
              <input
                type="date"
                value={importWeekEnd}
                onChange={e => setImportWeekEnd(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button onClick={() => setImportMode("upload")} className={`rounded-md px-4 py-2 text-sm font-medium ${importMode === "upload" ? "bg-brand-500 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            📂 Upload Samsara Excel
          </button>
          <button onClick={() => setImportMode("manual")} className={`rounded-md px-4 py-2 text-sm font-medium ${importMode === "manual" ? "bg-brand-500 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            ✏️ Manual Entry
          </button>
        </div>

        {/* Upload panel */}
        {importMode === "upload" && (
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-slate-700">Upload Samsara Weekly Vehicle Safety Report</p>
            <p className="mb-4 text-xs text-slate-400">Samsara → Reports → Vehicle Safety → Weekly → Export Excel (.xlsx)</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-md border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-sm text-slate-500 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600 w-full justify-center transition-colors"
            >
              <Upload className="h-5 w-5" />
              <span>Drop Samsara .xlsx here, or click to browse</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {xlsxSt && (
              <p className={`mt-2 text-xs font-medium ${xlsxSt.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{xlsxSt}</p>
            )}

            {/* Preview */}
            {uploadedDrivers.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Preview — {uploadedDrivers.length} drivers</p>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50"><tr><Th>Vehicle</Th><Th right>Score</Th><Th right>Drive Time</Th><Th right>Miles</Th><Th right>Events</Th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {uploadedDrivers.map(d => (
                        <tr key={d.name} className="hover:bg-slate-50">
                          <Td cls="font-medium">{d.name}</Td>
                          <Td right cls={`font-bold ${scoreTextClass(d.score)}`}>{d.score}</Td>
                          <Td right cls="text-slate-500">{d.drive}</Td>
                          <Td right cls="text-slate-500">{d.miles || "—"}</Td>
                          <Td right cls={d.events > 0 ? "text-red-600 font-semibold" : "text-slate-400"}>{d.events || "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => saveWeek(uploadedDrivers)}
                    disabled={upsert.isPending}
                    className="rounded-md bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                  >
                    {upsert.isPending ? "Saving…" : "Save Week"}
                  </button>
                  <button
                    onClick={() => { setUploadedDrivers([]); setXlsxSt(""); }}
                    className="rounded-md border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Manual entry panel */}
        {importMode === "manual" && (
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm font-semibold text-slate-700">Add Entries Manually</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Vehicle</label>
                <select
                  value={manVehicle}
                  onChange={e => setManVehicle(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                >
                  <option value="">— select —</option>
                  {VEHICLES.map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Safety Score</label>
                <input type="number" min="0" max="100" placeholder="0–100" value={manScore} onChange={e => setManScore(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Drive Time</label>
                <input type="text" placeholder="hh:mm:ss" value={manDrive} onChange={e => setManDrive(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Miles</label>
                <input type="number" step="0.1" placeholder="0.0" value={manMiles} onChange={e => setManMiles(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Events</label>
                <input type="number" min="0" placeholder="0" value={manEvents} onChange={e => setManEvents(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
              </div>
            </div>
            <button
              onClick={addManualEntry}
              className="mt-4 rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              + Add Entry
            </button>

            {/* Pending entries */}
            {pendingDrivers.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Pending — {pendingDrivers.length} entries</p>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50"><tr><Th>Vehicle</Th><Th right>Score</Th><Th right>Miles</Th><Th right>Events</Th><Th>{""}</Th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendingDrivers.map((d, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <Td cls="font-medium">{d.name}</Td>
                          <Td right cls={`font-bold ${scoreTextClass(d.score)}`}>{d.score}</Td>
                          <Td right cls="text-slate-500">{d.miles || "—"}</Td>
                          <Td right cls={d.events > 0 ? "text-red-600 font-semibold" : "text-slate-400"}>{d.events || "—"}</Td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => setPendingDrivers(p => p.filter((_, j) => j !== i))} className="text-xs text-red-400 hover:text-red-600">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => saveWeek(pendingDrivers)}
                    disabled={upsert.isPending}
                    className="rounded-md bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                  >
                    {upsert.isPending ? "Saving…" : "Save Week"}
                  </button>
                  <button
                    onClick={() => { setPendingDrivers([]); }}
                    className="rounded-md border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {pendingDrivers.length === 0 && (
              <div className="mt-6 flex items-center gap-2 rounded-md bg-amber-50 px-4 py-3 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Add at least one entry, then click Save Week.
              </div>
            )}
          </div>
        )}

        {/* Cancel */}
        <div>
          <button onClick={() => setTab("overview")} className="rounded-md border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Root ────────────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "history", label: "History & Trends" },
    { key: "import", label: "Import Week" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Driver Safety Scores"
        description="Weekly Samsara safety scores by vehicle — fleet average, rankings, and trends"
        action={
          <button
            onClick={() => { setImportLabel(""); setImportWeekEnd(""); setUploadedDrivers([]); setPendingDrivers([]); setXlsxSt(""); setTab("import"); }}
            className="flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <Upload className="h-4 w-4" /> Import Week
          </button>
        }
      />

      <div className="flex gap-0 border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.key ? "border-brand-500 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          {tab === "overview" && <Overview />}
          {tab === "history" && <History />}
          {tab === "import" && <Import />}
        </>
      )}
    </div>
  );
}
