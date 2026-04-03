"use client";

import { useState, useCallback, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Upload, ChevronLeft, ChevronRight, Trash2, Save, Copy, FileText } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  useAvbWeeks, useUpsertAvbWeek, useDeleteAvbWeek,
  type AvbWeekData, type GustoData, type DayData,
} from "@/lib/hooks/use-avb-weeks";

// ─── Constants ────────────────────────────────────────────────────────────────

const CREW_DEFS = [
  { code: "MAINT1", name: "Maintenance 1" },
  { code: "MAINT2", name: "Maintenance 2" },
  { code: "MAINT3", name: "Maintenance 3" },
  { code: "MAINT4", name: "Maintenance 4" },
  { code: "MAINT5", name: "Maintenance 5" },
  { code: "FERT1",  name: "Fert / Weed Control" },
  { code: "LNDSCP1",name: "Landscape Construction" },
  { code: "ENH1",   name: "Enhancement 1" },
];

const ALL_EMP = [
  { uuid: "87a264e0", name: "Rolando Alvarado",    csvName: "Alvarado, Rolando",                 csvJob: "Maintenance Crew Member" },
  { uuid: "b54b3f88", name: "Ryan Auger",           csvName: "Auger, Ryan"                                                         },
  { uuid: "6d5ded40", name: "Otilio Brizuela",      csvName: "Brizuela, Jose",                    csvJob: "Maintenance Crew Leader" },
  { uuid: "55f28eee", name: "James Brizuela",       csvName: "Brizuela, Jose",                    csvJob: "Maintenance Crew Member" },
  { uuid: "529bbd5c", name: "Mauricio Cruz",        csvName: "Cruz, Mauricio"                                                       },
  { uuid: "36a5a673", name: "Julio Escobar",        csvName: "Escobar, Julio"                                                       },
  { uuid: "695866b9", name: "Tyler Haywood",        csvName: "Haywood, Tyler"                                                       },
  { uuid: "3540efab", name: "Olvin Hernandez",      csvName: "Hernandez, Olvin"                                                     },
  { uuid: "38f06eb7", name: "Steve Krikorian II",   csvName: "Krikorian II, Stephen"                                                },
  { uuid: "41c55955", name: "Nelson Labelle",       csvName: "Labelle, Nelson"                                                      },
  { uuid: "2f1c79d8", name: "Jose Leiva",           csvName: "Leiva, Jose",                       csvJob: "Maintenance Crew Leader" },
  { uuid: "9c3e8613", name: "Saul Leiva",           csvName: "Leiva, Saul"                                                          },
  { uuid: "ad9b1c2e", name: "Eduard Martinez",      csvName: "Martinez Mejia, Eduard"                                               },
  { uuid: "69b0adca", name: "Marvin Mejia Lopez",   csvName: "Mejia Lopez, Marvin"                                                  },
  { uuid: "fde97e65", name: "Encarnacion Membrano", csvName: "Membrano Martinez, Encarnacion Cruz"                                  },
  { uuid: "d3b6869a", name: "Zackery Pervier",      csvName: "Pervier, Zackery"                                                     },
  { uuid: "32d07880", name: "Luis Pineda",          csvName: "Pineda, Luis"                                                         },
  { uuid: "f776a380", name: "Wilder Pineda",        csvName: "Pineda, Wilder"                                                       },
  { uuid: "c25bbf8d", name: "Juan Polanco Molina",  csvName: "Polanco Molina, Juan"                                                 },
  { uuid: "418e5fac", name: "Esdras Ramos Pacheco", csvName: "Ramos Pacheco, Esdras"                                                },
  { uuid: "0bfcb8df", name: "Jason Rodriguez",      csvName: "Rodriguez, Jason"                                                     },
  { uuid: "875c4721", name: "Juan Sanchez",         csvName: "Sanchez, Juan"                                                        },
  { uuid: "9695004c", name: "Mark Wiggins",         csvName: "Wiggins, Mark"                                                        },
];

const FIELD_UUIDS = ALL_EMP.map(e => e.uuid);

const DEF_ASSIGN: Record<string, string[]> = {
  MAINT1: [], MAINT2: ["6d5ded40","529bbd5c","36a5a673"],
  MAINT3: ["2f1c79d8","9c3e8613","ad9b1c2e","fde97e65","875c4721"],
  MAINT4: ["32d07880","f776a380","c25bbf8d","87a264e0"],
  MAINT5: [], FERT1: ["695866b9"],
  LNDSCP1: ["41c55955","b54b3f88","38f06eb7"],
  ENH1: ["d3b6869a","418e5fac","0bfcb8df","9695004c"],
};

const WDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const CREW_COLORS = ["#3b82f6","#22c55e","#ef4444","#f59e0b","#a78bfa","#60ab45","#06b6d4","#ec4899"];

type Tab = "summary" | "daily" | "history" | "import";

interface ImportState {
  days: Record<number, DayData>;
  gusto: GustoData;
  weekEnd: string;
  csvParsed: boolean;
  avbParsedDays: Set<number>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pf(v: unknown): number { return parseFloat(String(v ?? "").replace(",","")) || 0; }

function fmtDate(s: string): string {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dayKey(ws: string, idx: number): string {
  const d = new Date(ws + "T12:00:00"); d.setDate(d.getDate() + idx);
  return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${String(d.getFullYear()).slice(2)}`;
}

function dayLabel(ws: string, idx: number): string {
  const d = new Date(ws + "T12:00:00"); d.setDate(d.getDate() + idx);
  return `${WDAYS[idx]} ${d.getMonth()+1}/${d.getDate()}`;
}

function thisSunday(): string {
  const d = new Date(), sun = new Date(d);
  sun.setDate(d.getDate() + (7 - d.getDay()) % 7);
  return sun.toISOString().split("T")[0];
}

function getEmp(uuid: string) { return ALL_EMP.find(e => e.uuid === uuid); }

function matchUuid(csvName: string, job: string): string | null {
  const ex = ALL_EMP.find(e => e.csvName === csvName && e.csvJob && e.csvJob === job);
  if (ex) return ex.uuid;
  const byName = ALL_EMP.filter(e => e.csvName === csvName);
  if (byName.length === 1) return byName[0].uuid;
  if (byName.length > 1) return (byName.find(e => !e.csvJob || job.includes(e.csvJob)) ?? byName[0]).uuid;
  return ALL_EMP.find(e => e.name.toLowerCase().includes(csvName.split(",")[0].toLowerCase()))?.uuid ?? null;
}

function gDate(s: string): string {
  const p = s.split("/"), yr = p[2].length === 2 ? "20" + p[2] : p[2];
  return `${yr}-${p[0].padStart(2,"0")}-${p[1].padStart(2,"0")}`;
}

function csvRow(row: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (const c of row) { if (c === '"') q = !q; else if (c === "," && !q) { out.push(cur.trim()); cur = ""; } else cur += c; }
  out.push(cur.trim()); return out;
}

function parseGustoCsv(text: string): GustoData {
  const lines = text.split("\n").map(l => l.trim());
  const result: GustoData = { weekStart: null, weekEnd: null, employees: {} };
  const emp = (uuid: string) => { if (!result.employees[uuid]) result.employees[uuid] = { total: 0, regular: 0, ot: 0, days: [] }; return result.employees[uuid]; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/"/g, "");
    if (l.startsWith("Date range,")) {
      const pts = l.split(",")[1].split("-");
      result.weekStart = gDate(pts[0].trim()); result.weekEnd = gDate(pts[1].trim());
    }
    if (l.startsWith("Name,Manager")) {
      i++;
      while (i < lines.length) {
        const raw = lines[i].replace(/"/g, "");
        if (!raw || raw.startsWith("Hours for")) { i--; break; }
        const c = csvRow(lines[i]);
        if (c.length >= 3 && c[0] && c[0] !== "Name") {
          const parts = c[0].trim().split(" ");
          const lastFirst = parts.length > 1 ? parts.slice(1).join(" ") + ", " + parts[0] : c[0];
          const uuid = matchUuid(lastFirst, c[9] ?? "");
          if (uuid) { emp(uuid).total += pf(c[2]); emp(uuid).regular += pf(c[3]); emp(uuid).ot += pf(c[4]); }
        }
        i++;
      }
    }
    const hm = l.match(/^Hours for (.+)$/);
    if (hm) {
      i += 2;
      const daily: GustoData["employees"][string]["days"] = [];
      while (i < lines.length) {
        const raw = lines[i].replace(/"/g, "");
        if (!raw || raw.startsWith("Hours for")) { i--; break; }
        const c = csvRow(lines[i]);
        if (c[0]?.match(/\d{2}\/\d{2}\/\d{2}/)) daily.push({ date: c[0], total: pf(c[1]), regular: pf(c[2]), ot: pf(c[3]), mealBreak: pf(c[7]), timeRange: c[11] ?? "", job: c[12] ?? "" });
        i++;
      }
      const uuid = matchUuid(hm[1].trim(), daily.find(d => d.job)?.job ?? "");
      if (uuid) emp(uuid).days = daily;
    }
  }
  return result;
}

function getHrsOnDayIdx(gusto: GustoData, uuid: string, idx: number): number {
  if (!gusto.weekStart) return 0;
  return gusto.employees[uuid]?.days?.find(d => d.date === dayKey(gusto.weekStart!, idx))?.total ?? 0;
}

function blankDay(): DayData {
  return {
    assignments: Object.fromEntries(CREW_DEFS.map(cr => [cr.code, [...(DEF_ASSIGN[cr.code] ?? [])]])),
    avb: Object.fromEntries(CREW_DEFS.map(cr => [cr.code, { budgeted: 0, actual: 0, revenue: 0 }])),
  };
}

function blankImport(): ImportState {
  const days: Record<number, DayData> = {};
  for (let i = 0; i < 7; i++) days[i] = blankDay();
  return { days, gusto: { weekStart: null, weekEnd: null, employees: {} }, weekEnd: thisSunday(), csvParsed: false, avbParsedDays: new Set() };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ children, color }: { children: React.ReactNode; color: "green" | "yellow" | "red" | "gray" }) {
  const cls = { green: "bg-green-100 text-green-700", yellow: "bg-amber-100 text-amber-700", red: "bg-red-100 text-red-700", gray: "bg-slate-100 text-slate-500" }[color];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

function effBadge(eff: number | null) {
  if (eff === null) return <Badge color="gray">—</Badge>;
  const p = Math.round(eff * 100);
  return <Badge color={p >= 88 ? "green" : p >= 75 ? "yellow" : "red"}>{p}%</Badge>;
}

function KpiCard({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold text-slate-900 ${valueClass ?? ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function DayStrip({ labels, active, onSelect, hasData }: { labels: string[]; active: number; onSelect: (i: number) => void; hasData?: Set<number> }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {labels.map((lbl, i) => (
        <button key={i} onClick={() => onSelect(i)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors
            ${i === active ? "bg-brand-500 text-white" : hasData?.has(i) ? "border border-green-400 bg-green-50 text-green-700" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
          {lbl}
        </button>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AvbDashboard() {
  const { data: weeks = [], isLoading } = useAvbWeeks();
  const upsert = useUpsertAvbWeek();
  const delWeek = useDeleteAvbWeek();

  const [tab, setTab] = useState<Tab>("summary");
  const [viewWeekOffset, setViewWeekOffset] = useState(0); // 0 = latest
  const [viewDayIdx, setViewDayIdx] = useState(0);
  const [importDayIdx, setImportDayIdx] = useState(0);
  const [imp, setImp] = useState<ImportState>(blankImport);
  const [saving, setSaving] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const avbRef = useRef<HTMLInputElement>(null);

  const currentWeek = weeks.length ? weeks[weeks.length - 1 - viewWeekOffset] : null;

  // aggregation
  function crewTotals(w: NonNullable<typeof currentWeek>) {
    const t: Record<string, { budgeted: number; actual: number; revenue: number; gusto: number; ot: number }> = {};
    CREW_DEFS.forEach(cr => { t[cr.code] = { budgeted: 0, actual: 0, revenue: 0, gusto: 0, ot: 0 }; });
    for (let d = 0; d < 7; d++) {
      const day = w.data.days[d]; if (!day) continue;
      CREW_DEFS.forEach(cr => {
        const avb = day.avb?.[cr.code] ?? {};
        t[cr.code].budgeted += pf(avb.budgeted); t[cr.code].actual += pf(avb.actual); t[cr.code].revenue += pf(avb.revenue);
        (day.assignments?.[cr.code] ?? []).forEach(uuid => {
          t[cr.code].gusto += getHrsOnDayIdx(w.data.gusto, uuid, d);
          const dk = w.data.gusto.weekStart ? dayKey(w.data.gusto.weekStart, d) : null;
          const de = dk ? w.data.gusto.employees[uuid]?.days?.find(x => x.date === dk) : null;
          if (de) t[cr.code].ot += de.ot ?? 0;
        });
      });
    }
    return t;
  }

  function weekKpis(w: NonNullable<typeof currentWeek>) {
    const t = crewTotals(w);
    let tG = 0, tO = 0, tB = 0;
    CREW_DEFS.forEach(cr => { tG += t[cr.code].gusto; tO += t[cr.code].actual; tB += t[cr.code].budgeted; });
    return { tG, tO, tB, eff: tG > 0 ? tO / tG : null, gap: tG > 0 ? tG - tO : null, avbVar: tO - tB };
  }

  // CSV handler
  const handleCsv = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const gusto = parseGustoCsv(e.target!.result as string);
        setImp(p => ({ ...p, gusto, weekEnd: gusto.weekEnd ?? p.weekEnd, csvParsed: true }));
      } catch (err) { alert("CSV error: " + String(err)); }
    };
    reader.readAsText(file);
  }, []);

  // AvB PDF handler
  const handleAvbPdf = useCallback(async (file: File, dayIdx: number) => {
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const buf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      let fullText = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        type TItem = { transform: number[]; str: string };
        const items = (tc.items as TItem[]).map(i => ({ x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), str: i.str }));
        items.sort((a, b) => b.y - a.y || a.x - b.x);
        const lineMap: Record<number, typeof items> = {};
        items.forEach(it => { const yk = Math.round(it.y / 4) * 4; if (!lineMap[yk]) lineMap[yk] = []; lineMap[yk].push(it); });
        Object.keys(lineMap).map(Number).sort((a, b) => b - a).forEach(y => {
          lineMap[y].sort((a, b) => a.x - b.x);
          fullText += lineMap[y].map(i => i.str).join(" ") + "\n";
        });
      }
      const lines = fullText.split("\n");
      const parsed: Record<string, { budgeted: number; actual: number; revenue: number }> = {};
      const SUM = /Sum:.*Sum:.*Sum:/i, CREW = /^\s*(FERT\d*|LNDSCP\d*|MAINT\d*|ENH\d*)\s*$/i;
      const NUM = /([\d,]+\.\d{2,4})/g, DOL = /\$([\d,]+\.\d{2})/;
      for (let i = 0; i < lines.length - 2; i++) {
        if (SUM.test(lines[i])) {
          const cm = CREW.exec(lines[i + 1]);
          if (cm && !parsed[cm[1].toUpperCase()]) {
            const nums = [...lines[i + 2].matchAll(NUM)].map(m => parseFloat(m[1].replace(",","")));
            const dm = DOL.exec(lines[i + 2]);
            if (nums.length >= 2) parsed[cm[1].toUpperCase()] = { budgeted: nums[0], actual: nums[1], revenue: dm ? parseFloat(dm[1].replace(",","")) : 0 };
          }
        }
      }
      if (!Object.keys(parsed).length) { alert("No crew data found in PDF."); return; }
      setImp(p => {
        const days = { ...p.days };
        days[dayIdx] = { ...days[dayIdx], avb: { ...days[dayIdx].avb, ...parsed } };
        const avbParsedDays = new Set(p.avbParsedDays); avbParsedDays.add(dayIdx);
        return { ...p, days, avbParsedDays };
      });
    } catch (e) { alert("PDF error: " + String(e)); }
  }, []);

  // crew mutations
  const addToCrewDay = (dayIdx: number, crewCode: string, uuid: string) => {
    setImp(p => {
      const days = { ...p.days };
      // remove from all crews on this day first
      CREW_DEFS.forEach(cr => {
        days[dayIdx] = { ...days[dayIdx], assignments: { ...days[dayIdx].assignments, [cr.code]: (days[dayIdx].assignments[cr.code] ?? []).filter(u => u !== uuid) } };
      });
      days[dayIdx] = { ...days[dayIdx], assignments: { ...days[dayIdx].assignments, [crewCode]: [...(days[dayIdx].assignments[crewCode] ?? []), uuid] } };
      return { ...p, days };
    });
  };

  const removeFromCrew = (dayIdx: number, crewCode: string, uuid: string) => {
    setImp(p => {
      const days = { ...p.days };
      days[dayIdx] = { ...days[dayIdx], assignments: { ...days[dayIdx].assignments, [crewCode]: (days[dayIdx].assignments[crewCode] ?? []).filter(u => u !== uuid) } };
      return { ...p, days };
    });
  };

  const setAvbField = (dayIdx: number, crewCode: string, field: "budgeted" | "actual" | "revenue", val: number) => {
    setImp(p => {
      const days = { ...p.days };
      days[dayIdx] = { ...days[dayIdx], avb: { ...days[dayIdx].avb, [crewCode]: { ...(days[dayIdx].avb[crewCode] ?? {}), [field]: val } } };
      return { ...p, days };
    });
  };

  const copyDayAssignments = (from: number, to: number) => {
    setImp(p => {
      const days = { ...p.days };
      days[to] = { ...days[to], assignments: JSON.parse(JSON.stringify(p.days[from].assignments)) };
      return { ...p, days };
    });
  };

  const handleSave = async () => {
    if (!imp.weekEnd) { alert("Set week ending date."); return; }
    setSaving(true);
    try {
      await upsert.mutateAsync({ weekEnd: imp.weekEnd, data: { days: imp.days, gusto: imp.gusto } as AvbWeekData });
      setImp(blankImport()); setTab("summary"); setViewWeekOffset(0);
    } catch (e) { alert("Save failed: " + String(e)); }
    finally { setSaving(false); }
  };

  // day labels
  const ws = currentWeek?.data.gusto.weekStart;
  const viewDayLabels = ws ? WDAYS.map((_, i) => dayLabel(ws, i)) : WDAYS;
  const impWs = imp.gusto.weekStart;
  const impDayLabels = impWs ? WDAYS.map((_, i) => dayLabel(impWs, i)) : WDAYS;

  // history chart data
  const histData = weeks.map(w => {
    const kpis = weekKpis(w);
    const t = crewTotals(w);
    const point: Record<string, number | string> = { week: fmtDate(w.weekEnd), onSite: parseFloat(kpis.tO.toFixed(1)), gusto: parseFloat(kpis.tG.toFixed(1)) };
    CREW_DEFS.forEach(cr => { const g = t[cr.code].gusto; point[cr.code] = g > 0 ? Math.round(t[cr.code].actual / g * 100) : 0; });
    return point;
  });

  const tabBtn = (t: Tab, label: string) => (
    <button key={t} onClick={() => setTab(t)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
        ${tab === t ? "border-brand-500 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="AvB × Gusto — Crew Hours" description="Daily on-site hours vs Gusto clocked time by crew"
        action={
          <button onClick={() => { setImp(blankImport()); setTab("import"); }}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors">
            <Upload className="h-4 w-4" /> Import Week
          </button>
        }
      />

      <div className="flex gap-0 border-b border-slate-200 overflow-x-auto -mb-1">
        {tabBtn("summary","Weekly Summary")}{tabBtn("daily","Daily View")}{tabBtn("history","History & Trends")}{tabBtn("import","Import Week")}
      </div>

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}

      {/* ── WEEKLY SUMMARY ─────────────────────────────────────────────────────── */}
      {tab === "summary" && (
        <div className="flex flex-col gap-5">
          {!currentWeek ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">No weeks imported yet — use "Import Week" to get started.</div>
          ) : (() => {
            const kpis = weekKpis(currentWeek);
            const t = crewTotals(currentWeek);
            return (<>
              <div className="flex items-center gap-2">
                <button onClick={() => setViewWeekOffset(o => Math.min(o + 1, weeks.length - 1))} disabled={viewWeekOffset >= weeks.length - 1} className="rounded border p-1 disabled:opacity-30 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-sm font-medium text-slate-700">Week of {fmtDate(currentWeek.weekEnd)}</span>
                <button onClick={() => setViewWeekOffset(o => Math.max(o - 1, 0))} disabled={viewWeekOffset === 0} className="rounded border p-1 disabled:opacity-30 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
              </div>

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <KpiCard label="Gusto Clocked" value={kpis.tG.toFixed(1)} sub="hrs total" />
                <KpiCard label="On-Site (AvB)" value={kpis.tO.toFixed(1)} sub="hrs scheduled" />
                <KpiCard label="Indirect Gap" value={kpis.gap !== null ? (kpis.gap >= 0 ? "+" : "") + kpis.gap.toFixed(1) : "—"} sub="clocked − on-site" valueClass={kpis.gap !== null && Math.abs(kpis.gap) > 10 ? "text-red-600" : "text-green-600"} />
                <KpiCard label="Labor Efficiency" value={kpis.eff !== null ? Math.round(kpis.eff * 100) + "%" : "—"} sub="on-site ÷ clocked" valueClass={kpis.eff !== null ? kpis.eff >= 0.88 ? "text-green-600" : kpis.eff >= 0.75 ? "text-amber-600" : "text-red-600" : ""} />
                <KpiCard label="AvB Variance" value={(kpis.avbVar >= 0 ? "+" : "") + kpis.avbVar.toFixed(1)} sub="actual − budgeted" valueClass={kpis.avbVar >= 0 ? "text-green-600" : "text-red-600"} />
              </div>

              <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>{["Crew","Budgeted","On-Site","AvB Var","Gusto Clocked","Indirect Gap","Efficiency","OT Hrs","Revenue"].map((h,i) => (
                      <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap ${i > 0 ? "text-right" : ""}`}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {CREW_DEFS.map(cr => {
                      const ct = t[cr.code];
                      const avbVar = ct.actual - ct.budgeted;
                      const gap = ct.gusto > 0 ? ct.gusto - ct.actual : null;
                      return (
                        <tr key={cr.code} className="hover:bg-slate-50">
                          <td className="px-4 py-3"><span className="font-semibold">{cr.code}</span><span className="ml-2 text-xs text-slate-400">{cr.name}</span></td>
                          <td className="px-4 py-3 text-right tabular-nums">{ct.budgeted > 0 ? ct.budgeted.toFixed(1) : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{ct.actual > 0 ? ct.actual.toFixed(1) : "—"}</td>
                          <td className="px-4 py-3 text-right">{ct.budgeted > 0 ? <span className={avbVar >= 0 ? "text-green-600" : "text-red-600"}>{avbVar >= 0 ? "+" : ""}{avbVar.toFixed(1)}</span> : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{ct.gusto > 0 ? ct.gusto.toFixed(1) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-right">{gap !== null ? <span className={Math.abs(gap) > 3 ? "text-red-600" : Math.abs(gap) > 1 ? "text-amber-600" : "text-green-600"}>{gap >= 0 ? "+" : ""}{gap.toFixed(1)}</span> : "—"}</td>
                          <td className="px-4 py-3 text-right">{effBadge(ct.gusto > 0 ? ct.actual / ct.gusto : null)}</td>
                          <td className="px-4 py-3 text-right">{ct.ot > 0 ? <Badge color="yellow">{ct.ot.toFixed(1)}</Badge> : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{ct.revenue > 0 ? "$" + ct.revenue.toLocaleString() : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Employee Summary</p>
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>{["Employee","Crews","Gusto Total","Regular","OT","Days","Status"].map((h,i) => (
                      <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 ${i > 1 ? "text-right" : ""}`}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ALL_EMP.map(emp => {
                      const ed = currentWeek.data.gusto.employees[emp.uuid];
                      const crewSet = new Set<string>();
                      for (let d = 0; d < 7; d++) CREW_DEFS.forEach(cr => { if (currentWeek.data.days[d]?.assignments?.[cr.code]?.includes(emp.uuid)) crewSet.add(cr.code); });
                      if (!ed && crewSet.size === 0) return null;
                      const tot = ed?.total ?? 0, ot = ed?.ot ?? 0, dw = ed?.days?.filter(d => d.total > 0).length ?? 0;
                      return (
                        <tr key={emp.uuid} className={`hover:bg-slate-50 ${tot === 0 ? "opacity-40" : ""}`}>
                          <td className="px-4 py-3 font-medium">{emp.name}{ot > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">OT {ot.toFixed(1)}h</span>}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{[...crewSet].join(", ") || "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{tot > 0 ? tot.toFixed(2) : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{ed ? ed.regular.toFixed(2) : "—"}</td>
                          <td className="px-4 py-3 text-right">{ot > 0 ? <span className="text-amber-600 font-medium">{ot.toFixed(2)}</span> : "—"}</td>
                          <td className="px-4 py-3 text-right">{dw > 0 ? dw : "—"}</td>
                          <td className="px-4 py-3 text-right">{tot === 0 ? <Badge color="gray">absent</Badge> : ot > 0 ? <Badge color="yellow">OT</Badge> : <Badge color="green">ok</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>);
          })()}
        </div>
      )}

      {/* ── DAILY VIEW ──────────────────────────────────────────────────────────── */}
      {tab === "daily" && (
        <div>
          {!currentWeek ? <p className="text-sm text-slate-400">No week loaded.</p> : (
            <>
              <DayStrip labels={viewDayLabels} active={viewDayIdx} onSelect={setViewDayIdx} />
              {(() => {
                const day = currentWeek.data.days[viewDayIdx];
                const dk = currentWeek.data.gusto.weekStart ? dayKey(currentWeek.data.gusto.weekStart, viewDayIdx) : null;
                return (
                  <div className="flex flex-col gap-4">
                    <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 border-b"><tr>
                          {["Crew","Budgeted","On-Site","AvB Var","Gusto Clocked","Efficiency","Revenue"].map((h,i) => (
                            <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 ${i > 0 ? "text-right" : ""}`}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {CREW_DEFS.map(cr => {
                            const avb = day?.avb?.[cr.code] ?? { budgeted: 0, actual: 0, revenue: 0 };
                            const g = (day?.assignments?.[cr.code] ?? []).reduce((s, u) => s + getHrsOnDayIdx(currentWeek.data.gusto, u, viewDayIdx), 0);
                            const avar = pf(avb.actual) - pf(avb.budgeted);
                            return (
                              <tr key={cr.code} className="hover:bg-slate-50">
                                <td className="px-4 py-3"><span className="font-semibold">{cr.code}</span><span className="ml-2 text-xs text-slate-400">{cr.name}</span></td>
                                <td className="px-4 py-3 text-right tabular-nums">{pf(avb.budgeted) > 0 ? pf(avb.budgeted).toFixed(1) : "—"}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{pf(avb.actual) > 0 ? pf(avb.actual).toFixed(1) : "—"}</td>
                                <td className="px-4 py-3 text-right">{pf(avb.budgeted) > 0 ? <span className={avar >= 0 ? "text-green-600" : "text-red-600"}>{avar >= 0 ? "+" : ""}{avar.toFixed(1)}</span> : "—"}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{g > 0 ? g.toFixed(1) : "—"}</td>
                                <td className="px-4 py-3 text-right">{effBadge(g > 0 ? pf(avb.actual) / g : null)}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{pf(avb.revenue) > 0 ? "$" + pf(avb.revenue).toLocaleString() : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 border-b"><tr>
                          {["Employee","Crew","Total Hrs","Regular","OT","Clock In","Clock Out","Status"].map((h,i) => (
                            <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 ${i > 1 ? "text-right" : ""}`}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {CREW_DEFS.flatMap(cr =>
                            (day?.assignments?.[cr.code] ?? []).map(uuid => {
                              const emp = getEmp(uuid); if (!emp) return null;
                              const hrs = getHrsOnDayIdx(currentWeek.data.gusto, uuid, viewDayIdx);
                              const de = dk ? currentWeek.data.gusto.employees[uuid]?.days?.find(x => x.date === dk) : null;
                              const ot = de?.ot ?? 0;
                              const [inT="", outT=""] = de?.timeRange?.split(" - ") ?? [];
                              return (
                                <tr key={uuid+cr.code} className={`hover:bg-slate-50 ${hrs === 0 ? "opacity-40" : ""}`}>
                                  <td className="px-4 py-3 font-medium">{emp.name}{ot > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">OT</span>}</td>
                                  <td className="px-4 py-3"><Badge color="gray">{cr.code}</Badge></td>
                                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{hrs > 0 ? hrs.toFixed(2) : "—"}</td>
                                  <td className="px-4 py-3 text-right tabular-nums">{de?.regular ? de.regular.toFixed(2) : "—"}</td>
                                  <td className="px-4 py-3 text-right">{ot > 0 ? <span className="text-amber-600 font-medium">{ot.toFixed(2)}</span> : "—"}</td>
                                  <td className="px-4 py-3 text-right text-xs text-slate-500">{inT || "—"}</td>
                                  <td className="px-4 py-3 text-right text-xs text-slate-500">{outT || "—"}</td>
                                  <td className="px-4 py-3 text-right">{hrs === 0 ? <Badge color="gray">off</Badge> : ot > 0 ? <Badge color="yellow">OT</Badge> : <Badge color="green">worked</Badge>}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── HISTORY ─────────────────────────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="flex flex-col gap-5">
          {weeks.length === 0 ? <p className="text-sm text-slate-400">No history yet.</p> : (<>
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-slate-700">Labor Efficiency by Crew</p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={histData} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => v + "%"} domain={[0, 110]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => v + "%"} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {CREW_DEFS.map((cr, i) => <Line key={cr.code} type="monotone" dataKey={cr.code} stroke={CREW_COLORS[i]} strokeWidth={2} dot={false} connectNulls name={cr.code} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border bg-white p-5 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-slate-700">On-Site vs Gusto Clocked</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={histData} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="onSite" name="On-site (AvB)" fill="#60ab45" radius={[3,3,0,0]} />
                    <Bar dataKey="gusto" name="Gusto clocked" fill="#3b82f6" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto rounded-xl border bg-white p-5 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-slate-700">Weekly Log</p>
                <table className="min-w-full text-sm">
                  <thead><tr>{["Week","On-Site","Clocked","Efficiency",""].map((h,i) => (
                    <th key={i} className={`pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 ${i > 0 ? "text-right" : ""}`}>{h}</th>
                  ))}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...weeks].reverse().map(w => {
                      const kpis = weekKpis(w);
                      return (
                        <tr key={w.weekEnd} className="hover:bg-slate-50">
                          <td className="py-2 pr-4">{fmtDate(w.weekEnd)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{kpis.tO.toFixed(1)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{kpis.tG.toFixed(1)}</td>
                          <td className="py-2 pr-4 text-right">{effBadge(kpis.eff)}</td>
                          <td className="py-2 text-right">
                            <button onClick={() => { if (confirm("Delete " + fmtDate(w.weekEnd) + "?")) delWeek.mutate(w.weekEnd); }} className="text-red-400 hover:text-red-600 p-1 rounded">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>)}
        </div>
      )}

      {/* ── IMPORT ──────────────────────────────────────────────────────────────── */}
      {tab === "import" && (
        <div className="flex flex-col gap-4 max-w-5xl">
          {/* Step 1 – Gusto CSV */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-slate-700"><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">1</span>Upload Gusto CSV</p>
            <p className="mb-3 text-xs text-slate-400">Time Tracking → Reports → Hours → Weekly on Thursday → Download CSV</p>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCsv(f); e.target.value = ""; }} />
            <button onClick={() => csvRef.current?.click()}
              className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-sm font-medium transition-colors
                ${imp.csvParsed ? "border-green-400 bg-green-50 text-green-700" : "border-slate-200 text-slate-500 hover:border-brand-400 hover:text-brand-600"}`}>
              <Upload className="h-4 w-4" />
              {imp.csvParsed ? `✓ ${Object.keys(imp.gusto.employees).length} employees parsed  |  ${imp.gusto.weekStart} → ${imp.gusto.weekEnd}` : "Click to upload Gusto weekly CSV"}
            </button>
          </div>

          {/* Step 2 – Date */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-slate-700"><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">2</span>Week Ending Date</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs uppercase tracking-wider text-slate-500">Week ending (Sunday)</label>
              <input type="date" value={imp.weekEnd} onChange={e => setImp(p => ({ ...p, weekEnd: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:border-brand-400" />
            </div>
          </div>

          {/* Step 3 – Days */}
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-slate-700"><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">3</span>Daily Crew Assignments &amp; AvB PDFs</p>
            <p className="mb-3 text-xs text-slate-400">Upload each day&apos;s AvB PDF to auto-fill crew hours, then adjust assignments. Crews can differ day to day.</p>

            {/* Copy row */}
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Copy assignments from</span>
              <select id="cfrom" className="rounded border border-slate-200 px-2 py-1 text-xs bg-white">
                {impDayLabels.map((l,i) => <option key={i} value={i}>{l}</option>)}
              </select>
              <span>to</span>
              <select id="cto" className="rounded border border-slate-200 px-2 py-1 text-xs bg-white">
                {impDayLabels.map((l,i) => <option key={i} value={i}>{l}</option>)}
              </select>
              <button onClick={() => {
                const f = parseInt((document.getElementById("cfrom") as HTMLSelectElement).value);
                const t = parseInt((document.getElementById("cto") as HTMLSelectElement).value);
                copyDayAssignments(f, t);
              }} className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 hover:bg-slate-50"><Copy className="h-3 w-3" />Copy</button>
            </div>

            <DayStrip labels={impDayLabels} active={importDayIdx} onSelect={setImportDayIdx} hasData={imp.avbParsedDays} />

            {/* AvB PDF drop for active day */}
            <input ref={avbRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleAvbPdf(f, importDayIdx); e.target.value = ""; }} />
            <button onClick={() => avbRef.current?.click()}
              className={`mb-4 flex items-center gap-2 rounded-lg border-2 border-dashed px-4 py-2 text-xs font-medium transition-colors
                ${imp.avbParsedDays.has(importDayIdx) ? "border-green-400 bg-green-50 text-green-700" : "border-slate-200 text-slate-500 hover:border-brand-400 hover:text-brand-600"}`}>
              <FileText className="h-3.5 w-3.5" />
              {imp.avbParsedDays.has(importDayIdx) ? `✓ AvB PDF parsed for ${impDayLabels[importDayIdx]}` : `Upload AvB PDF for ${impDayLabels[importDayIdx]} — auto-fills crew hours`}
            </button>

            {/* Crew cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {CREW_DEFS.map(cr => {
                const day = imp.days[importDayIdx];
                const members = day?.assignments?.[cr.code] ?? [];
                const avb = day?.avb?.[cr.code] ?? { budgeted: 0, actual: 0, revenue: 0 };
                const workedUuids = new Set(
                  imp.gusto.weekStart
                    ? Object.entries(imp.gusto.employees).filter(([,ed]) => (ed.days?.find(d => d.date === dayKey(imp.gusto.weekStart!, importDayIdx))?.total ?? 0) > 0).map(([u]) => u)
                    : []
                );
                return (
                  <div key={cr.code} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">{cr.name}</span>
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{cr.code}</span>
                    </div>
                    <div className="mb-2 flex min-h-[22px] flex-wrap gap-1">
                      {members.map(uuid => {
                        const e = getEmp(uuid); if (!e) return null;
                        const hrs = imp.gusto.weekStart ? getHrsOnDayIdx(imp.gusto, uuid, importDayIdx) : null;
                        return (
                          <span key={uuid} className="flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px]">
                            {e.name.split(" ")[0]}
                            {hrs !== null && hrs > 0 && <span className="text-[10px] text-slate-400">{hrs.toFixed(1)}h</span>}
                            <button onClick={() => removeFromCrew(importDayIdx, cr.code, uuid)} className="ml-0.5 leading-none text-red-400 hover:text-red-600">×</button>
                          </span>
                        );
                      })}
                      {members.length === 0 && <span className="text-[11px] text-slate-400">No members</span>}
                    </div>
                    <select className="mb-2 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px]"
                      value="" onChange={e => { if (e.target.value) addToCrewDay(importDayIdx, cr.code, e.target.value); }}>
                      <option value="">Add employee…</option>
                      {FIELD_UUIDS.filter(u => !members.includes(u)).map(u => {
                        const e = getEmp(u); if (!e) return null;
                        return <option key={u} value={u}>{e.name}{workedUuids.has(u) ? " ✓" : ""}</option>;
                      })}
                    </select>
                    <div className="grid grid-cols-3 gap-1 border-t border-slate-200 pt-2">
                      {(["budgeted","actual","revenue"] as const).map(field => (
                        <div key={field}>
                          <label className="mb-0.5 block text-[9px] uppercase tracking-wider text-slate-400">{field === "budgeted" ? "Budget" : field === "actual" ? "On-site" : "Revenue"}</label>
                          <input type="number" step="0.5" min="0"
                            value={pf(avb[field]) || ""}
                            placeholder="0"
                            onChange={e => setAvbField(importDayIdx, cr.code, field, pf(e.target.value))}
                            className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-[11px] focus:border-brand-400 focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
              <Save className="h-4 w-4" />{saving ? "Saving…" : "Save Week → Dashboard"}
            </button>
            <button onClick={() => setTab("summary")} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
