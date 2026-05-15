"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Upload, Trash2, Pencil, AlertTriangle, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  useAvbWeeks, useUpsertAvbWeek, useDeleteAvbWeek,
  type AvbWeekData, type GustoData, type EmpData,
} from "@/lib/hooks/use-avb-weeks";
import {
  useAvbEmployees, useUpsertAvbEmployee,
  type AvbEmployee, type UpsertEmpPayload,
} from "@/lib/hooks/use-avb-employees";
import {
  useAvbCrews, useUpsertAvbCrew, useDeleteAvbCrew,
  type UpsertCrewPayload,
} from "@/lib/hooks/use-avb-crews";

// ── Types ─────────────────────────────────────────────────────────────────────
type CrewDef = { code: string; name: string };

// ── Constants ──────────────────────────────────────────────────────────────────
/** Hard-coded fallback — used while DB loads or when org has no saved crews yet. */
const DEFAULT_CREW_DEFS: CrewDef[] = [
  { code: "MAINT1",   name: "Maintenance 1" },
  { code: "MAINT2",   name: "Maintenance 2" },
  { code: "MAINT3",   name: "Maintenance 3" },
  { code: "MAINT4",   name: "Maintenance 4" },
  { code: "MAINT5",   name: "Maintenance 5" },
  { code: "FERT1",    name: "Fert / Weed Control" },
  { code: "LNDSCP1",  name: "Landscape Construction" },
  { code: "ENHANCE1", name: "Enhancement 1" },
];

// Seed roster — used as fallback while DB loads and for "Load Default Roster" action
const ALL_EMP = [
  { uuid:"87a264e0", name:"Rolando Alvarado",    csvName:"Alvarado, Rolando",                   csvJob:"Maintenance Crew Member" },
  { uuid:"b54b3f88", name:"Ryan Auger",           csvName:"Auger, Ryan",                         csvJob:"" },
  { uuid:"e4f5a6b7", name:"Daniel Batista",       csvName:"Batista, Daniel",                     csvJob:"Enhancement Crew Member" },
  { uuid:"6d5ded40", name:"Otilio Brizuela",      csvName:"Brizuela, Otilio",                    csvJob:"Maintenance Crew Leader" },
  { uuid:"55f28eee", name:"James Brizuela",       csvName:"Brizuela, James",                     csvJob:"Maintenance Crew Member" },
  { uuid:"529bbd5c", name:"Mauricio Cruz",        csvName:"Cruz, Mauricio",                      csvJob:"" },
  { uuid:"36a5a673", name:"Julio Escobar",        csvName:"Escobar, Julio",                      csvJob:"" },
  { uuid:"695866b9", name:"Tyler Haywood",        csvName:"Haywood, Tyler",                      csvJob:"" },
  { uuid:"3540efab", name:"Olvin Hernandez",      csvName:"Hernandez, Olvin",                    csvJob:"" },
  { uuid:"b5ad4fb2", name:"Casey Kleinman",       csvName:"Kleinman, Casey",                     csvJob:"" },
  { uuid:"38f06eb7", name:"Steve Krikorian II",   csvName:"Krikorian II, Stephen",               csvJob:"" },
  { uuid:"41c55955", name:"Nelson Labelle",       csvName:"Labelle, Nelson",                     csvJob:"" },
  { uuid:"2f1c79d8", name:"Jose Leiva",           csvName:"Leiva, Jose",                         csvJob:"Maintenance Crew Leader" },
  { uuid:"9c3e8613", name:"Saul Leiva",           csvName:"Leiva, Saul",                         csvJob:"" },
  { uuid:"3c084d9d", name:"Cam MacDonald",        csvName:"MacDonald, Camden",                   csvJob:"" },
  { uuid:"ad9b1c2e", name:"Eduard Martinez",      csvName:"Martinez Mejia, Eduard",              csvJob:"" },
  { uuid:"69b0adca", name:"Marvin Mejia Lopez",   csvName:"Mejia Lopez, Marvin",                 csvJob:"" },
  { uuid:"fde97e65", name:"Encarnacion Membrano", csvName:"Membrano Martinez, Encarnacion Cruz", csvJob:"" },
  { uuid:"d3b6869a", name:"Zackery Pervier",      csvName:"Pervier, Zackery",                    csvJob:"" },
  { uuid:"32d07880", name:"Luis Pineda",          csvName:"Pineda, Luis",                        csvJob:"" },
  { uuid:"f776a380", name:"Wilder Pineda",        csvName:"Pineda, Wilder",                      csvJob:"" },
  { uuid:"c25bbf8d", name:"Juan Polanco Molina",  csvName:"Polanco Molina, Juan",                csvJob:"" },
  { uuid:"418e5fac", name:"Esdras Ramos Pacheco", csvName:"Ramos Pacheco, Esdras",               csvJob:"" },
  { uuid:"0bfcb8df", name:"Jason Rodriguez",      csvName:"Rodriguez, Jason",                    csvJob:"" },
  { uuid:"875c4721", name:"Juan Sanchez",         csvName:"Sanchez, Juan",                       csvJob:"" },
  { uuid:"9695004c", name:"Mark Wiggins",         csvName:"Wiggins, Mark",                       csvJob:"" },
  { uuid:"c7e2a14b", name:"Osbaldo Navarro",      csvName:"Navarro, Osbaldo",                    csvJob:"" },
];

// Non-field (office) employee uuids — excluded from crew lists in seed data
const NON_FIELD_UUIDS = new Set(["b5ad4fb2","3c084d9d"]);

const DEF_ASSIGNMENTS: Record<string, string[]> = {
  MAINT1:   ["32d07880","87a264e0","fde97e65"],
  MAINT2:   ["529bbd5c","2f1c79d8","418e5fac","c7e2a14b"],
  MAINT3:   ["9c3e8613","36a5a673","6d5ded40"],
  MAINT4:   ["f776a380","3540efab","55f28eee"],
  MAINT5:   [],
  FERT1:    ["695866b9"],
  LNDSCP1:  ["9695004c","d3b6869a","38f06eb7","b54b3f88"],
  ENHANCE1: ["0bfcb8df","69b0adca","e4f5a6b7"],
};

const WDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const CREW_COLORS = ["#3b82f6","#22c55e","#ef4444","#f59e0b","#a78bfa","#60ab45","#06b6d4","#ec4899"];

type Tab = "summary" | "daily" | "history" | "ytd" | "import" | "settings";
type AvbField = "budgeted" | "actual" | "revenue";
type AvbWeek = { weekEnd: string; data: AvbWeekData };

// ── Utilities ──────────────────────────────────────────────────────────────────
const pf = (v: unknown) => parseFloat(String(v ?? "").replace(",","")) || 0;

const fmtDate = (s: string) => {
  if (!s) return "—";
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
};

function dayKey(ws: string, idx: number) {
  const d = new Date(ws + "T12:00:00"); d.setDate(d.getDate() + idx);
  return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${String(d.getFullYear()).slice(2)}`;
}

function dayIso(ws: string, idx: number) {
  const d = new Date(ws + "T12:00:00"); d.setDate(d.getDate() + idx);
  return d.toISOString().split("T")[0];
}

function dayLbl(ws: string, idx: number) {
  const d = new Date(ws + "T12:00:00"); d.setDate(d.getDate() + idx);
  return WDAYS[idx] + " " + (d.getMonth()+1) + "/" + d.getDate();
}

const thisSunday = () => {
  const d = new Date(); d.setDate(d.getDate() + (7-d.getDay())%7);
  return d.toISOString().split("T")[0];
};

function gDate(s: string) {
  const p = s.split("/"); const yr = p[2].length===2?"20"+p[2]:p[2];
  return `${yr}-${p[0].padStart(2,"0")}-${p[1].padStart(2,"0")}`;
}

function csvRow(row: string) {
  const out: string[] = []; let cur = ""; let q = false;
  for (const c of row) { if(c==='"'){q=!q;} else if(c===','&&!q){out.push(cur.trim());cur="";}else cur+=c; }
  out.push(cur.trim()); return out;
}

/** Find an employee's uuid by matching their Gusto CSV name + job title. */
function matchUuid(name: string, job: string, employees: AvbEmployee[]): string | null {
  const ex = employees.find(e => e.csvName===name && e.csvJob && e.csvJob===job);
  if (ex) return ex.uuid;
  const bn = employees.filter(e => e.csvName===name);
  if (bn.length===1) return bn[0].uuid;
  if (bn.length>1) return (bn.find(e=>!e.csvJob||job.includes(e.csvJob))??bn[0]).uuid;
  const last = name.split(",")[0].toLowerCase();
  return employees.find(e=>e.name.toLowerCase().includes(last))?.uuid ?? null;
}

function getEmp(uuid: string, employees: AvbEmployee[]): AvbEmployee | undefined {
  return employees.find(e => e.uuid === uuid);
}

function getHrsOnDay(gusto: GustoData, uuid: string, dayIdx: number) {
  if (!gusto.weekStart) return 0;
  const dk = dayKey(gusto.weekStart, dayIdx);
  return gusto.employees[uuid]?.days.find(d=>d.date===dk)?.total ?? 0;
}

const epColor = (ep: number|null) => ep===null ? "text-slate-400" : ep>=88 ? "text-green-600" : ep>=75 ? "text-amber-500" : "text-red-500";
const epBadge = (ep: number|null) => ep===null ? "bg-slate-100 text-slate-500" : ep>=88 ? "bg-green-100 text-green-700" : ep>=75 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";

// ── CSV Parser ────────────────────────────────────────────────────────────────
function parseGustoCsv(text: string, employees: AvbEmployee[]): GustoData {
  const lines = text.split("\n").map(l=>l.trim());
  const result: GustoData = { weekStart:null, weekEnd:null, employees:{} };
  const emp = (uuid: string): EmpData => {
    if (!result.employees[uuid]) result.employees[uuid] = {total:0,regular:0,ot:0,days:[]};
    return result.employees[uuid];
  };
  for (let i=0; i<lines.length; i++) {
    const l = lines[i].replace(/"/g,"");
    if (l.startsWith("Date range,")) {
      const pts = l.split(",")[1].split("-");
      result.weekStart = gDate(pts[0].trim()); result.weekEnd = gDate(pts[1].trim());
    }
    if (l.startsWith("Name,Manager")) {
      i++;
      while (i<lines.length) {
        const raw = lines[i].replace(/"/g,"");
        if (!raw||raw.startsWith("Hours for")) { i--; break; }
        const c = csvRow(lines[i]);
        if (c.length>=3&&c[0]&&c[0]!=="Name") {
          const parts = c[0].trim().split(" ");
          const lf = parts.length>1 ? parts.slice(1).join(" ")+", "+parts[0] : c[0];
          const uuid = matchUuid(lf, c[9]??"", employees);
          if (uuid) { emp(uuid).total+=pf(c[2]); emp(uuid).regular+=pf(c[3]); emp(uuid).ot+=pf(c[4]); }
        }
        i++;
      }
    }
    const hm = l.match(/^Hours for (.+)$/);
    if (hm) {
      i+=2; const daily: EmpData["days"]=[];
      while (i<lines.length) {
        const raw = lines[i].replace(/"/g,"");
        if (!raw||raw.startsWith("Hours for")) { i--; break; }
        const c = csvRow(lines[i]);
        if (c.length>=3&&c[0]?.match(/^\d{1,2}\/\d{1,2}\/\d{2}$/)) {
          const [dm,dd,dy]=c[0].split("/");
          const normDate=dm.padStart(2,"0")+"/"+dd.padStart(2,"0")+"/"+dy;
          daily.push({date:normDate,total:pf(c[1]),regular:pf(c[2]),ot:pf(c[3]),mealBreak:pf(c[7]),timeRange:c[11]??"",job:c[12]??""});
        }
        i++;
      }
      const nm = hm[1].trim().replace(/,+$/, "").trim();
      const job = daily.find(d=>d.job)?.job??"";
      const uuid = matchUuid(nm, job, employees);
      if (uuid) emp(uuid).days = daily;
    }
  }
  return result;
}

// ── PDF Parser (dynamic pdf.js) ───────────────────────────────────────────────
async function parseAvbPdf(
  file: File,
  knownCrewCodes: string[] = [],
): Promise<Record<string, {budgeted:number;actual:number;revenue:number}>> {
  type PdfLib = {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument: (o: {data: ArrayBuffer}) => {
      promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<{
          getTextContent: () => Promise<{items: {transform: number[]; str: string}[]}>
        }>
      }>
    }
  };
  if (!(window as {pdfjsLib?: unknown}).pdfjsLib) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = () => {
        ((window as {pdfjsLib?: PdfLib}).pdfjsLib!).GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        res();
      };
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const lib = (window as {pdfjsLib?: PdfLib}).pdfjsLib!;
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({data: buf}).promise;

  // Build text lines. Use 8 px Y-tolerance (vs old 4 px) so items on the
  // same visual row aren't split when PDF sub-pixel positions vary slightly.
  const allLines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc   = await page.getTextContent();
    const items = (tc.items as {transform: number[]; str: string}[]).map(i => ({
      x: Math.round(i.transform[4]),
      y: Math.round(i.transform[5]),
      str: i.str,
    }));
    const lm: Record<number, typeof items> = {};
    items.forEach(it => {
      const yk = Math.round(it.y / 8) * 8;
      if (!lm[yk]) lm[yk] = [];
      lm[yk].push(it);
    });
    Object.keys(lm).map(Number).sort((a, b) => b - a).forEach(y => {
      lm[y].sort((a, b) => a.x - b.x);
      const s = lm[y].map(i => i.str).join(" ").trim();
      if (s) allLines.push(s);
    });
  }

  const NUMS = /([\d,]+\.\d{2,4})/g;
  const DOLR = /\$([\d,]+\.\d{2})/;
  const knownUpper = knownCrewCodes.map(c => c.toUpperCase());
  const codeSet    = new Set(knownUpper);

  function extractNums(s: string): number[] {
    return [...s.matchAll(NUMS)].map(m => parseFloat(m[1].replace(/,/g, "")));
  }
  function extractRevenue(s: string, nums: number[]): number {
    const dm = DOLR.exec(s);
    if (dm) return parseFloat(dm[1].replace(/,/g, ""));
    return nums.length >= 3 ? nums[2] : 0;
  }
  /** Returns the crew code if this line contains a crew code, else null. */
  function matchCrewCode(line: string): string | null {
    const trimmed = line.trim().toUpperCase();
    // 1. Whole line (spaces stripped) matches a code — handles "MAINT 1" → "MAINT1"
    const noSpaces = trimmed.replace(/\s+/g, "");
    if (codeSet.has(noSpaces)) return noSpaces;
    // 2. Any individual token matches — handles lines where Y-tolerance merged the
    //    crew code with adjacent PDF elements (e.g. "MAINT1 18.50" → token "MAINT1")
    for (const tok of trimmed.split(/\s+/)) {
      if (codeSet.has(tok)) return tok;
    }
    // 3. Fallback regex when no known codes were supplied
    if (knownUpper.length === 0) {
      const m = /^([A-Z]{2,10}\d*)$/.exec(noSpaces);
      return m ? m[1] : null;
    }
    return null;
  }

  const results: Record<string, {budgeted: number; actual: number; revenue: number}> = {};

  // ── Pass 1: Sum-row strategy ────────────────────────────────────────────────
  // Find any line with 2+ "Sum:" tokens (the totals header). Look ±3 lines for
  // a known crew code, then grab numbers from the Sum line (or nearby lines).
  for (let i = 0; i < allLines.length; i++) {
    const sumMatches = allLines[i].match(/Sum:/gi);
    if (!sumMatches || sumMatches.length < 2) continue;

    // Find nearest crew code in a ±3 line window (skip the Sum line itself)
    let crewCode: string | null = null;
    for (let off = -3; off <= 3; off++) {
      if (off === 0) continue;
      const idx = i + off;
      if (idx < 0 || idx >= allLines.length) continue;
      const code = matchCrewCode(allLines[idx]);
      if (code && !results[code]) { crewCode = code; break; }
    }
    if (!crewCode) continue;

    // Grab numbers from the Sum line; if too few, scan forward up to 3 lines
    let nums = extractNums(allLines[i]);
    if (nums.length < 2) {
      for (let j = i + 1; j <= i + 3 && j < allLines.length; j++) {
        nums = extractNums(allLines[j]);
        if (nums.length >= 2) break;
      }
    }
    if (nums.length >= 2) {
      results[crewCode] = {
        budgeted: nums[0],
        actual:   nums[1],
        revenue:  extractRevenue(allLines[i], nums),
      };
    }
  }

  // ── Pass 2: Crew-code-first scan ────────────────────────────────────────────
  // For any known code not yet captured, find its line directly and look in
  // the surrounding lines for a row that contains numbers.
  for (const code of knownUpper) {
    if (results[code]) continue;
    for (let i = 0; i < allLines.length; i++) {
      if (matchCrewCode(allLines[i]) !== code) continue;
      // Search lines before and after the crew-code line for numbers
      for (let off = -2; off <= 5; off++) {
        if (off === 0) continue;
        const idx = i + off;
        if (idx < 0 || idx >= allLines.length) continue;
        const nums = extractNums(allLines[idx]);
        if (nums.length >= 2) {
          results[code] = {
            budgeted: nums[0],
            actual:   nums[1],
            revenue:  extractRevenue(allLines[idx], nums),
          };
          break;
        }
      }
      if (results[code]) break;
    }
  }

  return results;
}

// ── Default state ─────────────────────────────────────────────────────────────
function defaultWeekData(defAssignments: Record<string, string[]>, crewDefs: CrewDef[]): AvbWeekData {
  return {
    days: Object.fromEntries(Array.from({length:7},(_,i)=>[i,{
      assignments: Object.fromEntries(crewDefs.map(cr=>[cr.code,[...(defAssignments[cr.code]??[])]])),
      avb: Object.fromEntries(crewDefs.map(cr=>[cr.code,{budgeted:0,actual:0,revenue:0}])),
    }])),
    gusto: {weekStart:null,weekEnd:null,employees:{}},
  };
}

// ── Aggregation ───────────────────────────────────────────────────────────────
function crewTotals(data: AvbWeekData, crewDefs: CrewDef[]) {
  const ct: Record<string,{budgeted:number;actual:number;revenue:number;gusto:number;ot:number}> = {};
  crewDefs.forEach(cr=>{ct[cr.code]={budgeted:0,actual:0,revenue:0,gusto:0,ot:0};});
  for (let d=0; d<7; d++) {
    const day=data.days[d]; if(!day) continue;
    crewDefs.forEach(cr=>{
      const avb=day.avb[cr.code]??{};
      ct[cr.code].budgeted+=pf(avb.budgeted);ct[cr.code].actual+=pf(avb.actual);ct[cr.code].revenue+=pf(avb.revenue);
      (day.assignments[cr.code]??[]).forEach(uuid=>{
        ct[cr.code].gusto+=getHrsOnDay(data.gusto,uuid,d);
        if(data.gusto.weekStart){const dk=dayKey(data.gusto.weekStart,d);const de=data.gusto.employees[uuid]?.days.find(x=>x.date===dk);if(de)ct[cr.code].ot+=de.ot;}
      });
    });
  }
  return ct;
}

// ── Shared UI primitives ──────────────────────────────────────────────────────
function KpiCard({label,value,sub,cls}:{label:string;value:string;sub?:string;cls?:string}) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${cls??"text-slate-900"}`}>{value}</p>
      {sub&&<p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
function Bdg({text,v}:{text:string;v:"green"|"amber"|"red"|"gray"}) {
  const c={green:"bg-green-100 text-green-700",amber:"bg-amber-100 text-amber-700",red:"bg-red-100 text-red-700",gray:"bg-slate-100 text-slate-500"}[v];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${c}`}>{text}</span>;
}
function InfoBar({children,warn=false}:{children:React.ReactNode;warn?:boolean}) {
  const c = warn?"border-amber-400 bg-amber-50 text-amber-800":"border-blue-400 bg-blue-50 text-blue-800";
  return <div className={`mb-3 rounded-r-md border-l-4 px-3 py-2 text-xs ${c}`}>{children}</div>;
}
function Th({children,right=false}:{children:React.ReactNode;right?:boolean}) {
  return <th className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400 ${right?"text-right":"text-left"}`}>{children}</th>;
}
function Td({children,right=false,cls=""}:{children:React.ReactNode;right?:boolean;cls?:string}) {
  return <td className={`px-3 py-3 ${right?"text-right tabular-nums":""} ${cls}`}>{children}</td>;
}

// ── AvbNumberInput ────────────────────────────────────────────────────────────
// IMPORTANT: Must stay at module level. If defined inside AvbDashboard or any
// tab component, React treats it as a new component type on every parent
// re-render and unmounts+remounts it — killing input focus mid-tab.
function AvbNumberInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value > 0 ? String(value) : "");
  const prevValue = useRef(value);
  if (prevValue.current !== value) {
    prevValue.current = value;
    setLocal(value > 0 ? String(value) : "");
  }
  return (
    <input
      type="number"
      step="0.5"
      min="0"
      value={local}
      placeholder="0"
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onCommit(local)}
      onWheel={e => e.currentTarget.blur()}
      className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-right text-xs"
    />
  );
}

// ── Summary Tab ───────────────────────────────────────────────────────────────
interface SummaryProps {
  cur: AvbWeek | null;
  employees: AvbEmployee[];
  crewDefs: CrewDef[];
  onEditWeek: (w: AvbWeek) => void;
  onImportNew: () => void;
}
function Summary({ cur, employees, crewDefs, onEditWeek, onImportNew }: SummaryProps) {
  if (!cur) return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 py-16 text-center">
      <Upload className="mb-3 h-8 w-8 text-slate-300" />
      <p className="text-sm font-medium text-slate-500">No data yet</p>
      <p className="mt-1 text-xs text-slate-400">Import a week to get started</p>
      <button onClick={onImportNew} className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">Import Week</button>
    </div>
  );
  const data=cur.data; const ct=crewTotals(data, crewDefs);
  const tG=Object.values(ct).reduce((s,t)=>s+t.gusto,0);
  const tO=Object.values(ct).reduce((s,t)=>s+t.actual,0);
  const tB=Object.values(ct).reduce((s,t)=>s+t.budgeted,0);
  const tAvb=tB-tO; const tGap=tG>0?tG-tO:null; const tEff=tG>0?Math.round(tO/tG*100):null;
  const empCrews: Record<string,Set<string>>={};
  for(let d=0;d<7;d++){const day=data.days[d];if(!day)continue;crewDefs.forEach(cr=>{(day.assignments[cr.code]??[]).forEach(u=>{if(!empCrews[u])empCrews[u]=new Set();empCrews[u].add(cr.code);});});}
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between rounded-md bg-slate-50 px-4 py-2 text-sm text-slate-500">
        <span>Week of {fmtDate(cur.weekEnd)}</span>
        <button
          onClick={()=>onEditWeek(cur)}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
        ><Pencil className="h-3 w-3"/>Edit Week</button>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Gusto Clocked" value={tG>0?tG.toFixed(1):"—"} sub="hrs total" />
        <KpiCard label="On-Site (AvB)" value={tO>0?tO.toFixed(1):"—"} sub="hrs scheduled" />
        <KpiCard label="Indirect Gap" value={tGap!==null?(tGap>=0?"+":"")+tGap.toFixed(1):"—"} sub="clocked − on-site" cls={tGap!==null?(Math.abs(tGap)>10?"text-red-600":"text-green-600"):"text-slate-400"} />
        <KpiCard label="Labor Efficiency" value={tEff!==null?tEff+"%":"—"} sub="on-site ÷ clocked" cls={epColor(tEff)} />
        <KpiCard label="AvB Variance" value={(tAvb>=0?"+":"")+tAvb.toFixed(1)} sub="budgeted − actual" cls={tAvb>=0?"text-green-600":"text-red-600"} />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Crew Summary</p>
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>
              <Th>Crew</Th><Th right>Budgeted</Th><Th right>On-Site</Th><Th right>AvB Var</Th>
              <Th right>Gusto Clocked</Th><Th right>Indirect Gap</Th><Th right>Efficiency</Th>
              <Th right>OT Hrs</Th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {crewDefs.map(cr=>{
                const t=ct[cr.code]; const avbV=t.budgeted-t.actual;
                const gap=t.gusto>0?t.gusto-t.actual:null; const ep=t.gusto>0?Math.round(t.actual/t.gusto*100):null;
                return (<tr key={cr.code} className="hover:bg-slate-50">
                  <td className="py-3 pl-4 font-medium">{cr.code}<span className="ml-1 text-xs text-slate-400">{cr.name}</span></td>
                  <Td right>{t.budgeted>0?t.budgeted.toFixed(1):"—"}</Td>
                  <Td right>{t.actual>0?t.actual.toFixed(1):"—"}</Td>
                  <Td right>{t.budgeted>0?<span className={avbV>=0?"text-green-600":"text-red-600"}>{avbV>=0?"+":""}{avbV.toFixed(1)}</span>:"—"}</Td>
                  <Td right>{t.gusto>0?t.gusto.toFixed(1):<span className="text-slate-300">—</span>}</Td>
                  <Td right>{gap!==null?<span className={Math.abs(gap)>3?"text-red-600":Math.abs(gap)>1?"text-amber-500":"text-green-600"}>{gap>=0?"+":""}{gap.toFixed(1)}</span>:"—"}</Td>
                  <Td right>{ep!==null?<span className={`${epBadge(ep)} rounded-full px-2 py-0.5 text-xs font-semibold`}>{ep}%</span>:"—"}</Td>
                  <Td right cls="pr-4">{t.ot>0?<span className="text-amber-600">{t.ot.toFixed(1)}</span>:"—"}</Td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Employee Summary</p>
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>
              <Th>Employee</Th><Th>Crews</Th><Th right>Total</Th><Th right>Regular</Th><Th right>OT</Th><Th right>Days</Th><Th>Status</Th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map(emp=>{
                let tot=0, ot=0, dw=0;
                for(let d=0;d<7;d++){
                  const dayHrs=getHrsOnDay(data.gusto,emp.uuid,d);
                  tot+=dayHrs;
                  if(dayHrs>0) dw++;
                  if(data.gusto.weekStart){
                    const dk=dayKey(data.gusto.weekStart,d);
                    const de=data.gusto.employees[emp.uuid]?.days.find(x=>x.date===dk);
                    if(de) ot+=de.ot;
                  }
                }
                const crew=empCrews[emp.uuid];
                if(!crew&&tot===0) return null;
                const reg=tot>ot?tot-ot:0;
                return (<tr key={emp.uuid} className={`hover:bg-slate-50 ${tot===0?"opacity-50":""}`}>
                  <td className="py-3 pl-4 font-medium">{emp.name}{ot>0&&<span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">OT {ot.toFixed(1)}h</span>}</td>
                  <td className="px-3 py-3 text-xs text-slate-400">{[...(crew??new Set())].join(", ")||"—"}</td>
                  <Td right>{tot>0?tot.toFixed(2):"—"}</Td>
                  <Td right>{tot>0?reg.toFixed(2):"—"}</Td>
                  <Td right>{ot>0?<span className="text-amber-600">{ot.toFixed(2)}</span>:"—"}</Td>
                  <Td right>{dw>0?dw:"—"}</Td>
                  <td className="px-3 py-3">{tot===0?<Bdg text="absent" v="gray"/>:ot>0?<Bdg text="OT" v="amber"/>:<Bdg text="ok" v="green"/>}</td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Daily Tab ─────────────────────────────────────────────────────────────────
interface DailyProps {
  cur: AvbWeek | null;
  employees: AvbEmployee[];
  crewDefs: CrewDef[];
  viewDay: number;
  setViewDay: (n: number) => void;
}
function Daily({ cur, employees, crewDefs, viewDay, setViewDay }: DailyProps) {
  if (!cur) return <div className="py-16 text-center text-sm text-slate-400">No week loaded.</div>;
  const data=cur.data; const day=data.days[viewDay]; const ws2=data.gusto.weekStart;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {Array.from({length:7},(_,i)=>(
          <button key={i} onClick={()=>setViewDay(i)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${i===viewDay?"bg-brand-500 text-white":"border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {ws2?dayLbl(ws2,i):WDAYS[i]}
          </button>
        ))}
      </div>
      <p className="text-sm font-semibold text-slate-700">Crew — {ws2?dayLbl(ws2,viewDay):WDAYS[viewDay]}</p>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50"><tr><Th>Crew</Th><Th right>Budgeted</Th><Th right>On-Site</Th><Th right>AvB Var</Th><Th right>Gusto Clocked</Th><Th right>Efficiency</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {crewDefs.map(cr=>{
              const avb=day?.avb[cr.code]??{}; const members=day?.assignments[cr.code]??[];
              let g=0; members.forEach(u=>{g+=getHrsOnDay(data.gusto,u,viewDay);});
              const bud=pf(avb.budgeted),act=pf(avb.actual),avar=bud-act;
              const ep=g>0?Math.round(act/g*100):null;
              return (<tr key={cr.code} className="hover:bg-slate-50">
                <td className="py-3 pl-4 font-medium">{cr.code}<span className="ml-1 text-xs text-slate-400">{cr.name}</span></td>
                <Td right>{bud>0?bud.toFixed(1):"—"}</Td><Td right>{act>0?act.toFixed(1):"—"}</Td>
                <Td right>{bud>0?<span className={avar>=0?"text-green-600":"text-red-600"}>{avar>=0?"+":""}{avar.toFixed(1)}</span>:"—"}</Td>
                <Td right>{g>0?g.toFixed(1):"—"}</Td>
                <Td right cls="pr-4">{ep!==null?<span className={`${epBadge(ep)} rounded-full px-2 py-0.5 text-xs font-semibold`}>{ep}%</span>:"—"}</Td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm font-semibold text-slate-700">Employees — {ws2?dayLbl(ws2,viewDay):WDAYS[viewDay]}</p>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50"><tr><Th>Employee</Th><Th>Crew</Th><Th right>Total Hrs</Th><Th right>Regular</Th><Th right>OT</Th><Th right>Clock In</Th><Th right>Clock Out</Th><Th>Status</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {crewDefs.flatMap(cr=>(day?.assignments[cr.code]??[]).map(uuid=>{
              const emp=getEmp(uuid, employees); if(!emp) return null;
              const hrs=getHrsOnDay(data.gusto,uuid,viewDay);
              const dk=ws2?dayKey(ws2,viewDay):null;
              const de=dk?data.gusto.employees[uuid]?.days.find(x=>x.date===dk):null;
              const ot=de?.ot??0; const [inT,outT]=de?.timeRange?.split(" - ")??["",""];
              return (<tr key={uuid+cr.code} className={`hover:bg-slate-50 ${hrs===0?"opacity-50":""}`}>
                <td className="py-3 pl-4 font-medium">{emp.name}{ot>0&&<span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">OT</span>}</td>
                <td className="px-3 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{cr.code}</span></td>
                <Td right>{hrs>0?hrs.toFixed(2):"—"}</Td>
                <Td right>{(de?.regular??0)>0?de!.regular.toFixed(2):"—"}</Td>
                <Td right>{ot>0?<span className="text-amber-600">{ot.toFixed(2)}</span>:"—"}</Td>
                <td className="px-3 py-3 text-right text-xs text-slate-500">{inT||"—"}</td>
                <td className="px-3 py-3 text-right text-xs text-slate-500">{outT||"—"}</td>
                <td className="px-3 py-3">{hrs===0?<Bdg text="off" v="gray"/>:ot>0?<Bdg text="OT" v="amber"/>:<Bdg text="worked" v="green"/>}</td>
              </tr>);
            })).filter(Boolean)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────
interface HistoryProps {
  weeks: AvbWeek[];
  crewDefs: CrewDef[];
  onEditWeek: (w: AvbWeek) => void;
  onDeleteWeek: (weekEnd: string) => void;
}
function History({ weeks, crewDefs, onEditWeek, onDeleteWeek }: HistoryProps) {
  if (!weeks.length) return <div className="py-16 text-center text-sm text-slate-400">No history yet.</div>;
  const labels = weeks.map(w=>fmtDate(w.weekEnd));
  const hrsData = weeks.map((w,i)=>{
    let tO=0,tG=0;
    crewDefs.forEach(cr=>{for(let d=0;d<7;d++){tO+=pf(w.data.days[d]?.avb[cr.code]?.actual);(w.data.days[d]?.assignments[cr.code]??[]).forEach(u=>{tG+=getHrsOnDay(w.data.gusto,u,d);});}});
    return {week:labels[i],"On-site":parseFloat(tO.toFixed(1)),"Gusto":parseFloat(tG.toFixed(1))};
  });
  const effData = weeks.map((w,i)=>{
    const pt: Record<string,number|string>={week:labels[i]};
    crewDefs.forEach(cr=>{let g=0,o=0;for(let d=0;d<7;d++){o+=pf(w.data.days[d]?.avb[cr.code]?.actual);(w.data.days[d]?.assignments[cr.code]??[]).forEach(u=>{g+=getHrsOnDay(w.data.gusto,u,d);});}if(g>0)pt[cr.code]=parseFloat((o/g*100).toFixed(1));});
    return pt;
  });
  return (
    <div className="flex flex-col gap-6">
      <InfoBar>Charts build week over week as you import data.</InfoBar>
      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm font-semibold text-slate-700">Labor Efficiency by Crew (%)</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={effData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="week" tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false} />
            <YAxis domain={[0,110]} tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false} tickFormatter={v=>v+"%"} />
            <Tooltip formatter={(v:number)=>[v+"%"]} contentStyle={{fontSize:12,borderRadius:8}} />
            <Legend wrapperStyle={{fontSize:11}} />
            {crewDefs.map((cr,i)=><Line key={cr.code} type="monotone" dataKey={cr.code} stroke={CREW_COLORS[i%CREW_COLORS.length]} strokeWidth={2} dot={false} connectNulls />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm font-semibold text-slate-700">On-Site vs Gusto Clocked</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hrsData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="week" tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false} />
            <YAxis tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{fontSize:12,borderRadius:8}} />
            <Legend wrapperStyle={{fontSize:11}} />
            <Bar dataKey="On-site" fill="#60ab45" radius={[3,3,0,0]} />
            <Bar dataKey="Gusto" fill="#3b82f6" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Weekly Log</p>
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><Th>Week</Th><Th right>Budgeted</Th><Th right>On-Site</Th><Th right>Gusto Clocked</Th><Th right>Indirect Gap</Th><Th right>Efficiency</Th><Th>{""}</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {[...weeks].reverse().map(w=>{
                let tG=0,tO=0,tB=0;
                crewDefs.forEach(cr=>{for(let d=0;d<7;d++){tO+=pf(w.data.days[d]?.avb[cr.code]?.actual);tB+=pf(w.data.days[d]?.avb[cr.code]?.budgeted);(w.data.days[d]?.assignments[cr.code]??[]).forEach(u=>{tG+=getHrsOnDay(w.data.gusto,u,d);});}});
                const gap=tG>0?tG-tO:null; const ep=tG>0?Math.round(tO/tG*100):null;
                return (<tr key={w.weekEnd} className="hover:bg-slate-50">
                  <td className="py-3 pl-4 font-medium">Week of {fmtDate(w.weekEnd)}</td>
                  <Td right>{tB.toFixed(1)}</Td><Td right>{tO.toFixed(1)}</Td>
                  <Td right>{tG>0?tG.toFixed(1):"—"}</Td>
                  <Td right>{gap!==null?<span className={Math.abs(gap)>10?"text-red-600":"text-green-600"}>{gap>=0?"+":""}{gap.toFixed(1)}</span>:"—"}</Td>
                  <Td right>{ep!==null?<span className={`${epBadge(ep)} rounded-full px-2 py-0.5 text-xs font-semibold`}>{ep}%</span>:"—"}</Td>
                  <td className="px-3 py-3 pr-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button title="Edit week" onClick={()=>onEditWeek(w)} className="text-slate-400 hover:text-brand-600"><Pencil className="h-4 w-4"/></button>
                      <button onClick={()=>{if(confirm("Delete week of "+fmtDate(w.weekEnd)+"?"))onDeleteWeek(w.weekEnd);}} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4"/></button>
                    </div>
                  </td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Import Tab ────────────────────────────────────────────────────────────────
interface ImportProps {
  wd: AvbWeekData;
  employees: AvbEmployee[];
  crewDefs: CrewDef[];
  fieldUuids: string[];
  importDay: number;
  setImportDay: (n: number) => void;
  weekEnd: string;
  setWeekEnd: (s: string) => void;
  csvSt: string;
  pdfSt: Record<number, string>;
  cpFrom: string;
  setCpFrom: (s: string) => void;
  cpTo: string;
  setCpTo: (s: string) => void;
  csvRef: React.RefObject<HTMLInputElement | null>;
  pdfRef: React.RefObject<HTMLInputElement | null>;
  onCsvFile: (f: File) => void;
  onPdfFile: (f: File, di: number) => void;
  onCopyAssignments: () => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
  onSetAvb: (di: number, code: string, field: AvbField, val: string) => void;
  onAddToCrew: (di: number, code: string, uuid: string) => void;
  onRmFromCrew: (di: number, code: string, uuid: string) => void;
  onSetEmpHours: (uuid: string, di: number, total: number, regular: number, ot: number) => void;
  onCancel: () => void;
}
function Import({
  wd, employees, crewDefs, fieldUuids, importDay, setImportDay, weekEnd, setWeekEnd,
  csvSt, pdfSt, cpFrom, setCpFrom, cpTo, setCpTo,
  csvRef, pdfRef, onCsvFile, onPdfFile, onCopyAssignments,
  onSave, isSaving, onSetAvb, onAddToCrew, onRmFromCrew,
  onSetEmpHours, onCancel,
}: ImportProps) {
  const ws = wd.gusto.weekStart;
  const day = wd.days[importDay];
  const isoDate = ws ? dayIso(ws, importDay) : null;
  const workedToday = new Set<string>();
  if (isoDate && ws) {
    const dk = dayKey(ws, importDay);
    Object.entries(wd.gusto.employees).forEach(([uuid, ed]) => {
      if (ed.days.find(d=>d.date===dk&&d.total>0)) workedToday.add(uuid);
    });
  }
  const allAssigned = new Set(Object.values(day.assignments).flat());
  const unassigned = fieldUuids.filter(u=>!allAssigned.has(u)&&workedToday.has(u));

  const dayOpts = Array.from({length:7},(_,i)=>(
    <option key={i} value={i}>{ws?dayLbl(ws,i):WDAYS[i]}</option>
  ));

  return (
    <div className="flex flex-col gap-5">
      {/* Step 1 */}
      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-semibold text-slate-700">Step 1 — Upload Gusto CSV (whole week)</p>
        <p className="mb-3 text-xs text-slate-400">Time Tracking → Reports → Hours → Weekly on Thursday → Download CSV</p>
        <div className="flex items-center gap-3">
          <button onClick={()=>csvRef.current?.click()} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="h-4 w-4"/> Upload CSV
          </button>
          {csvSt&&<span className={`text-xs ${csvSt.startsWith("✓")?"text-green-600":"text-red-500"}`}>{csvSt}</span>}
        </div>
        <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)onCsvFile(f);}} />
      </div>
      {/* Step 2 */}
      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-700">Step 2 — Set Week Ending Date</p>
        <div className="flex items-center gap-3">
          <input type="date" value={weekEnd} onChange={e=>setWeekEnd(e.target.value)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm"/>
          <button onClick={()=>setWeekEnd(thisSunday())} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">This Week</button>
        </div>
      </div>
      {/* Step 3 */}
      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-semibold text-slate-700">Step 3 — Daily Crew Assignments & AvB Data</p>
        <InfoBar>For each day: upload your AvB PDF (auto-fills crew hours), then assign employees to crews. Assignments can differ day to day.</InfoBar>
        {/* Copy row */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Copy assignments from</span>
          <select value={cpFrom} onChange={e=>setCpFrom(e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-xs"><option value="">— day —</option>{dayOpts}</select>
          <span>to</span>
          <select value={cpTo} onChange={e=>setCpTo(e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-xs"><option value="">— day —</option>{dayOpts}</select>
          <button onClick={onCopyAssignments} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50">Copy</button>
        </div>
        {/* Day strip */}
        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({length:7},(_,i)=>{
            const hasAvb=crewDefs.some(cr=>(wd.days[i]?.avb[cr.code]?.actual??0)>0);
            return (<button key={i} onClick={()=>setImportDay(i)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${i===importDay?"bg-brand-500 text-white":hasAvb?"border border-green-400 text-green-600 hover:bg-green-50":"border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {ws?dayLbl(ws,i):WDAYS[i]}
            </button>);
          })}
        </div>
        {/* PDF upload for this day */}
        <div className="mb-4">
          <p className="mb-1.5 text-xs text-slate-500">Upload AvB PDF for {ws?dayLbl(ws,importDay):WDAYS[importDay]} — auto-fills crew hours</p>
          <div className="flex items-center gap-3">
            <button onClick={()=>pdfRef.current?.click()} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5"/> Upload AvB PDF
            </button>
            {pdfSt[importDay]&&<span className={`text-xs ${pdfSt[importDay].startsWith("✓")?"text-green-600":pdfSt[importDay]==="Parsing…"?"text-slate-400":"text-red-500"}`}>{pdfSt[importDay]}</span>}
          </div>
          <input ref={pdfRef} type="file" accept=".pdf" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){onPdfFile(f,importDay);e.target.value="";}}} />
        </div>
        {unassigned.length>0&&<InfoBar warn>Worked today but not assigned: {unassigned.map(u=>getEmp(u, employees)?.name).join(", ")}</InfoBar>}
        {/* Crew cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {crewDefs.map(cr=>{
            const members=day.assignments[cr.code]??[]; const avb=day.avb[cr.code]??{budgeted:0,actual:0,revenue:0};
            return (<div key={cr.code} className="flex flex-col gap-2 rounded-lg border bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">{cr.name}</span>
                <span className="rounded border bg-white px-1.5 py-0.5 text-[10px] text-slate-400">{cr.code}</span>
              </div>
              <div className="flex min-h-[24px] flex-wrap gap-1">
                {members.map(uuid=>{const e=getEmp(uuid, employees);if(!e)return null;
                  const hrs=isoDate&&ws?wd.gusto.employees[uuid]?.days.find(d=>d.date===dayKey(ws,importDay))?.total??null:null;
                  return (<span key={uuid} className="inline-flex items-center gap-1 rounded border bg-white px-1.5 py-0.5 text-xs">
                    {e.name.split(" ")[0]}{hrs!==null&&hrs>0&&<span className="text-slate-400">{hrs.toFixed(1)}h</span>}
                    <button onClick={()=>onRmFromCrew(importDay,cr.code,uuid)} className="leading-none text-red-400 hover:text-red-600">×</button>
                  </span>);
                })}
                {members.length===0&&<span className="text-[11px] text-slate-400">No members</span>}
              </div>
              <select defaultValue="" className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                onChange={e=>{if(e.target.value){onAddToCrew(importDay,cr.code,e.target.value);e.target.value="";}}}>
                <option value="">Add employee…</option>
                {fieldUuids.filter(u=>!members.includes(u)).map(u=>{const e=getEmp(u, employees);return e?<option key={u} value={u}>{e.name}</option>:null;})}
              </select>
              <div className="border-t border-slate-200 pt-2">
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-400">AvB Hours {avb.actual>0&&<span className="text-green-600">✓ auto-filled</span>}</p>
                <div className="grid grid-cols-3 gap-1">
                  {(["budgeted","actual","revenue"] as const).map(f=>(
                    <div key={f}>
                      <label className="text-[9px] uppercase text-slate-400">{f==="revenue"?"Revenue $":f}</label>
                      <AvbNumberInput
                        value={avb[f]??0}
                        onCommit={v=>onSetAvb(importDay,cr.code,f,v)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>);
          })}
        </div>
      </div>
      {/* Manual hours override */}
      {(() => {
        const assignedUuids = [...new Set(Object.values(day.assignments).flat())];
        if (!assignedUuids.length) return null;
        return (
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-slate-700">Manual Hours Override</p>
            <p className="mb-4 text-xs text-slate-400">
              Edit hours for any employee whose time didn&apos;t come over from the CSV for{" "}
              <span className="font-medium">{ws ? dayLbl(ws, importDay) : WDAYS[importDay]}</span>.
            </p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Employee</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Crew</th>
                    <th className="w-24 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Total Hrs</th>
                    <th className="w-24 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Regular</th>
                    <th className="w-24 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">OT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignedUuids.map(uuid => {
                    const emp = getEmp(uuid, employees); if (!emp) return null;
                    const crewCode = Object.entries(day.assignments).find(([, v]) => v.includes(uuid))?.[0] ?? "—";
                    const dk = ws ? dayKey(ws, importDay) : null;
                    const de = dk ? wd.gusto.employees[uuid]?.days.find(x => x.date === dk) : null;
                    const total   = de?.total    ?? 0;
                    const regular = de?.regular  ?? 0;
                    const ot      = de?.ot       ?? 0;
                    const missing = total === 0;
                    return (
                      <tr key={uuid} className={`hover:bg-slate-50 ${missing ? "bg-amber-50" : ""}`}>
                        <td className="px-3 py-2.5 font-medium">
                          <div className="flex items-center gap-1.5">
                            {missing && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                            <span>{emp.name}</span>
                            {missing && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">no hours</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{crewCode}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <AvbNumberInput
                            value={total}
                            onCommit={v => {
                              const t = pf(v);
                              const r = regular || t;
                              onSetEmpHours(uuid, importDay, t, r > t ? t : r, ot);
                            }}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <AvbNumberInput
                            value={regular}
                            onCommit={v => onSetEmpHours(uuid, importDay, total, pf(v), ot)}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <AvbNumberInput
                            value={ot}
                            onCommit={v => onSetEmpHours(uuid, importDay, total, regular, pf(v))}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
      <div className="flex gap-3">
        <button onClick={onSave} disabled={isSaving} className="rounded-md bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {isSaving?"Saving…":"Save Week → Dashboard"}
        </button>
        <button onClick={onCancel} className="rounded-md border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
      </div>
    </div>
  );
}

// ── YTD Tab ───────────────────────────────────────────────────────────────────
interface YtdProps {
  weeks: AvbWeek[];
  crewDefs: CrewDef[];
}
function Ytd({ weeks, crewDefs }: YtdProps) {
  if (!weeks.length) return <div className="py-16 text-center text-sm text-slate-400">No history yet.</div>;
  let ytdB=0,ytdO=0,ytdG=0,ytdOt=0;
  const crewYtd: Record<string,{budgeted:number;actual:number;gusto:number;ot:number}> = {};
  crewDefs.forEach(cr=>{crewYtd[cr.code]={budgeted:0,actual:0,gusto:0,ot:0};});
  weeks.forEach(w=>{
    crewDefs.forEach(cr=>{
      for(let d=0;d<7;d++){
        const avb=w.data.days[d]?.avb[cr.code]??{};
        const b=pf(avb.budgeted),a=pf(avb.actual);
        crewYtd[cr.code].budgeted+=b; crewYtd[cr.code].actual+=a;
        ytdB+=b; ytdO+=a;
        (w.data.days[d]?.assignments[cr.code]??[]).forEach(u=>{
          const g=getHrsOnDay(w.data.gusto,u,d);
          crewYtd[cr.code].gusto+=g; ytdG+=g;
          if(w.data.gusto.weekStart){const dk=dayKey(w.data.gusto.weekStart,d);const de=w.data.gusto.employees[u]?.days.find(x=>x.date===dk);if(de){crewYtd[cr.code].ot+=de.ot;ytdOt+=de.ot;}}
        });
      }
    });
  });
  const ytdAvb=ytdB-ytdO;
  const ytdEff=ytdG>0?Math.round(ytdO/ytdG*100):null;
  const ytdGap=ytdG>0?ytdG-ytdO:null;
  const weekRows = [...weeks].reverse().map(w=>{
    let wB=0,wO=0,wG=0;
    crewDefs.forEach(cr=>{for(let d=0;d<7;d++){wB+=pf(w.data.days[d]?.avb[cr.code]?.budgeted);wO+=pf(w.data.days[d]?.avb[cr.code]?.actual);(w.data.days[d]?.assignments[cr.code]??[]).forEach(u=>{wG+=getHrsOnDay(w.data.gusto,u,d);});}});
    const wAvb=wB-wO; const wEff=wG>0?Math.round(wO/wG*100):null; const wGap=wG>0?wG-wO:null;
    return {label:fmtDate(w.weekEnd),wB,wO,wG,wAvb,wEff,wGap};
  });
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <KpiCard label="Gusto Clocked" value={ytdG>0?ytdG.toFixed(1):"—"} sub={`hrs · ${weeks.length} wks`} />
        <KpiCard label="On-Site (AvB)" value={ytdO>0?ytdO.toFixed(1):"—"} sub="hrs scheduled" />
        <KpiCard label="Indirect Gap" value={ytdGap!==null?(ytdGap>=0?"+":"")+ytdGap.toFixed(1):"—"} sub="clocked − on-site" cls={ytdGap!==null?(Math.abs(ytdGap)>10?"text-red-600":"text-green-600"):"text-slate-400"} />
        <KpiCard label="Labor Efficiency" value={ytdEff!==null?ytdEff+"%":"—"} sub="on-site ÷ clocked" cls={epColor(ytdEff)} />
        <KpiCard label="AvB Variance" value={(ytdAvb>=0?"+":"")+ytdAvb.toFixed(1)} sub="budgeted − actual" cls={ytdAvb>=0?"text-green-600":"text-red-600"} />
        <KpiCard label="Total OT" value={ytdOt>0?ytdOt.toFixed(1):"—"} sub="hrs overtime" cls={ytdOt>0?"text-amber-600":"text-slate-400"} />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">YTD by Crew</p>
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>
              <Th>Crew</Th><Th right>Budgeted</Th><Th right>On-Site</Th><Th right>AvB Var</Th>
              <Th right>Gusto Clocked</Th><Th right>Indirect Gap</Th><Th right>Efficiency</Th><Th right>OT Hrs</Th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {crewDefs.map(cr=>{
                const t=crewYtd[cr.code];
                const avbV=t.budgeted-t.actual;
                const gap=t.gusto>0?t.gusto-t.actual:null;
                const ep=t.gusto>0?Math.round(t.actual/t.gusto*100):null;
                return (<tr key={cr.code} className="hover:bg-slate-50">
                  <td className="py-3 pl-4 font-medium">{cr.code}<span className="ml-1 text-xs text-slate-400">{cr.name}</span></td>
                  <Td right>{t.budgeted>0?t.budgeted.toFixed(1):"—"}</Td>
                  <Td right>{t.actual>0?t.actual.toFixed(1):"—"}</Td>
                  <Td right>{t.budgeted>0?<span className={avbV>=0?"text-green-600":"text-red-600"}>{avbV>=0?"+":""}{avbV.toFixed(1)}</span>:"—"}</Td>
                  <Td right>{t.gusto>0?t.gusto.toFixed(1):"—"}</Td>
                  <Td right>{gap!==null?<span className={Math.abs(gap)>10?"text-red-600":"text-green-600"}>{gap>=0?"+":""}{gap.toFixed(1)}</span>:"—"}</Td>
                  <Td right>{ep!==null?<span className={`${epBadge(ep)} rounded-full px-2 py-0.5 text-xs font-semibold`}>{ep}%</span>:"—"}</Td>
                  <Td right cls="pr-4">{t.ot>0?<span className="text-amber-600">{t.ot.toFixed(1)}</span>:"—"}</Td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Week-by-Week</p>
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>
              <Th>Week</Th><Th right>Budgeted</Th><Th right>On-Site</Th><Th right>AvB Var</Th>
              <Th right>Gusto Clocked</Th><Th right>Indirect Gap</Th><Th right>Efficiency</Th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {weekRows.map(r=>(
                <tr key={r.label} className="hover:bg-slate-50">
                  <td className="py-3 pl-4 font-medium">Week of {r.label}</td>
                  <Td right>{r.wB.toFixed(1)}</Td>
                  <Td right>{r.wO.toFixed(1)}</Td>
                  <Td right>{r.wB>0?<span className={r.wAvb>=0?"text-green-600":"text-red-600"}>{r.wAvb>=0?"+":""}{r.wAvb.toFixed(1)}</span>:"—"}</Td>
                  <Td right>{r.wG>0?r.wG.toFixed(1):"—"}</Td>
                  <Td right>{r.wGap!==null?<span className={Math.abs(r.wGap)>10?"text-red-600":"text-green-600"}>{r.wGap>=0?"+":""}{r.wGap.toFixed(1)}</span>:"—"}</Td>
                  <Td right cls="pr-4">{r.wEff!==null?<span className={`${epBadge(r.wEff)} rounded-full px-2 py-0.5 text-xs font-semibold`}>{r.wEff}%</span>:"—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
interface EmpFormState {
  uuid: string;
  name: string;
  csvName: string;
  csvJob: string;
  defaultCrew: string;
  isField: boolean;
}

interface SettingsProps {
  crewDefs: CrewDef[];
  dbEmployees: AvbEmployee[] | undefined;
  onUpsert: (emp: UpsertEmpPayload) => void;
  isUpserting: boolean;
  onSeedRoster: () => Promise<void>;
  isSeeding: boolean;
  onUpsertCrew: (c: UpsertCrewPayload) => void;
  onDeleteCrew: (id: string) => void;
  isUpsertingCrew: boolean;
  dbCrews: import("@/lib/hooks/use-avb-crews").AvbCrew[] | undefined;
}

function Settings({ crewDefs, dbEmployees, onUpsert, isUpserting, onSeedRoster, isSeeding, onUpsertCrew, onDeleteCrew, isUpsertingCrew, dbCrews }: SettingsProps) {
  // ── Crew form state ──────────────────────────────────────────────────────────
  const [crewEditId, setCrewEditId] = useState<string | null>(null);
  const [crewForm, setCrewForm] = useState<{code: string; name: string} | null>(null);

  function openAddCrew() { setCrewEditId(null); setCrewForm({ code: "", name: "" }); }
  function openEditCrew(c: import("@/lib/hooks/use-avb-crews").AvbCrew) {
    setCrewEditId(c.id);
    setCrewForm({ code: c.code, name: c.name });
  }
  function closeCrewForm() { setCrewForm(null); setCrewEditId(null); }
  function saveCrewForm() {
    if (!crewForm || !crewForm.code.trim() || !crewForm.name.trim()) return;
    onUpsertCrew({ ...(crewEditId ? { id: crewEditId } : {}), code: crewForm.code, name: crewForm.name });
    closeCrewForm();
  }

  const notSeededCrews = dbCrews !== undefined && dbCrews.length === 0;

  // ── Employee form state ──────────────────────────────────────────────────────
  const blank: EmpFormState = { uuid: "", name: "", csvName: "", csvJob: "", defaultCrew: "", isField: true };
  const [editId, setEditId] = useState<string | null>(null); // null = adding new
  const [form, setForm] = useState<EmpFormState | null>(null); // null = form hidden

  function openAdd() {
    setEditId(null);
    setForm({ ...blank });
  }
  function openEdit(emp: AvbEmployee) {
    setEditId(emp.id);
    setForm({ uuid: emp.uuid, name: emp.name, csvName: emp.csvName, csvJob: emp.csvJob, defaultCrew: emp.defaultCrew, isField: emp.isField });
  }
  function closeForm() { setForm(null); setEditId(null); }

  function saveForm() {
    if (!form || !form.name.trim()) return;
    const uuid = form.uuid || Math.random().toString(36).slice(2, 10);
    onUpsert({
      ...(editId ? { id: editId } : {}),
      uuid,
      name: form.name.trim(),
      csvName: form.csvName.trim(),
      csvJob: form.csvJob.trim(),
      defaultCrew: form.defaultCrew,
      isField: form.isField,
      isActive: true,
    });
    closeForm();
  }

  function setActive(emp: AvbEmployee, isActive: boolean) {
    onUpsert({ id: emp.id, uuid: emp.uuid, name: emp.name, csvName: emp.csvName, csvJob: emp.csvJob, defaultCrew: emp.defaultCrew, isField: emp.isField, isActive });
  }

  const notSeeded = dbEmployees !== undefined && dbEmployees.length === 0;
  const active = (dbEmployees ?? []).filter(e => e.isActive);
  const inactive = (dbEmployees ?? []).filter(e => !e.isActive);

  return (
    <div className="flex flex-col gap-5">

      {/* ── Crews section ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Crews</p>
          <p className="text-xs text-slate-400">{crewDefs.length} crew{crewDefs.length !== 1 ? "s" : ""} · shown in all tabs and crew cards</p>
        </div>
        <div className="flex gap-2">
          {notSeededCrews && (
            <button
              onClick={() => DEFAULT_CREW_DEFS.forEach((c, i) => onUpsertCrew({ code: c.code, name: c.name, sortOrder: i }))}
              disabled={isUpsertingCrew}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              Load Default Crews
            </button>
          )}
          <button
            onClick={openAddCrew}
            className="flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            <Plus className="h-3.5 w-3.5" /> Add Crew
          </button>
        </div>
      </div>

      {/* Crew add/edit form */}
      {crewForm && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-brand-700">{crewEditId ? "Edit Crew" : "New Crew"}</p>
            <button onClick={closeCrewForm} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Code * <span className="font-normal text-slate-400">(e.g. MAINT6)</span></label>
              <input
                type="text"
                value={crewForm.code}
                onChange={e => setCrewForm(f => f ? { ...f, code: e.target.value.toUpperCase() } : f)}
                placeholder="e.g. ENHANCE2"
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm uppercase"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Display Name *</label>
              <input
                type="text"
                value={crewForm.name}
                onChange={e => setCrewForm(f => f ? { ...f, name: e.target.value } : f)}
                placeholder="e.g. Enhancement 2"
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={saveCrewForm}
              disabled={isUpsertingCrew || !crewForm.code.trim() || !crewForm.name.trim()}
              className="rounded-md bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {isUpsertingCrew ? "Saving…" : crewEditId ? "Save Changes" : "Add Crew"}
            </button>
            <button onClick={closeCrewForm} className="rounded-md border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Crew list */}
      {crewDefs.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr><Th>Code</Th><Th>Name</Th><Th>{""}</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(dbCrews ?? []).filter(c => c.isActive).map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-700">{c.code}</td>
                  <td className="px-3 py-2.5 text-slate-800">{c.name}</td>
                  <td className="px-3 py-2.5 pr-4">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => openEditCrew(c)} title="Edit" className="text-slate-400 hover:text-brand-600"><Pencil className="h-3.5 w-3.5" /></button>
                      <button
                        onClick={() => { if (confirm(`Remove crew "${c.code} — ${c.name}"? Historical data is preserved.`)) onDeleteCrew(c.id); }}
                        title="Remove"
                        disabled={isUpsertingCrew}
                        className="text-slate-400 hover:text-red-500 disabled:opacity-50"
                      ><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {notSeededCrews && crewDefs.map(c => (
                <tr key={c.code} className="opacity-60">
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-400">{c.code}</td>
                  <td className="px-3 py-2.5 text-slate-400 italic">{c.name} <span className="ml-1 text-[10px]">(default)</span></td>
                  <td className="px-3 py-2.5" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-slate-200 pt-2" />

      {/* Seed banner — shown only when DB has no employees at all */}
      {notSeeded && (
        <div className="flex items-center gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">No team roster yet</p>
            <p className="mt-0.5 text-xs text-amber-700">Load the default roster to instantly populate all current employees with their default crew assignments. You can edit or remove anyone afterward.</p>
          </div>
          <button
            onClick={onSeedRoster}
            disabled={isSeeding}
            className="shrink-0 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {isSeeding ? "Loading…" : "Load Default Roster"}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Team Roster</p>
          <p className="text-xs text-slate-400">{active.length} active · {inactive.length} inactive</p>
        </div>
        <div className="flex gap-2">
          {!notSeeded && dbEmployees && dbEmployees.length > 0 && (
            <button
              onClick={onSeedRoster}
              disabled={isSeeding}
              title="Re-sync default roster (won't overwrite manual edits)"
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {isSeeding ? "Syncing…" : "Sync Default Roster"}
            </button>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            <Plus className="h-3.5 w-3.5" /> Add Employee
          </button>
        </div>
      </div>

      {/* Add / Edit form */}
      {form && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-brand-700">{editId ? "Edit Employee" : "New Employee"}</p>
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Display Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => f ? { ...f, name: e.target.value } : f)}
                placeholder="e.g. John Smith"
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">CSV Name (Gusto format)</label>
              <input
                type="text"
                value={form.csvName}
                onChange={e => setForm(f => f ? { ...f, csvName: e.target.value } : f)}
                placeholder="e.g. Smith, John"
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">CSV Job Title</label>
              <input
                type="text"
                value={form.csvJob}
                onChange={e => setForm(f => f ? { ...f, csvJob: e.target.value } : f)}
                placeholder="e.g. Maintenance Crew Member"
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Default Crew</label>
              <select
                value={form.defaultCrew}
                onChange={e => setForm(f => f ? { ...f, defaultCrew: e.target.value } : f)}
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
              >
                <option value="">— None —</option>
                {crewDefs.map(cr => (
                  <option key={cr.code} value={cr.code}>{cr.code} — {cr.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isField}
                  onChange={e => setForm(f => f ? { ...f, isField: e.target.checked } : f)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Field employee (assigned to crews)
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={saveForm}
              disabled={isUpserting || !form.name.trim()}
              className="rounded-md bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {isUpserting ? "Saving…" : editId ? "Save Changes" : "Add Employee"}
            </button>
            <button onClick={closeForm} className="rounded-md border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Active employees table */}
      {active.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>Name</Th>
                <Th>CSV Name</Th>
                <Th>CSV Job</Th>
                <Th>Default Crew</Th>
                <Th>Field</Th>
                <Th>{""}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {active.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium text-slate-800">{emp.name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{emp.csvName || "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{emp.csvJob || "—"}</td>
                  <td className="px-3 py-2.5">
                    {emp.defaultCrew
                      ? <span className="rounded bg-brand-100 px-1.5 py-0.5 text-xs font-semibold text-brand-700">{emp.defaultCrew}</span>
                      : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs ${emp.isField ? "text-green-600" : "text-slate-400"}`}>
                      {emp.isField ? "✓" : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 pr-4">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => openEdit(emp)}
                        title="Edit"
                        className="text-slate-400 hover:text-brand-600"
                      ><Pencil className="h-3.5 w-3.5" /></button>
                      <button
                        onClick={() => { if (confirm(`Deactivate ${emp.name}? They'll be removed from crew lists but historical data is preserved.`)) setActive(emp, false); }}
                        title="Deactivate"
                        className="text-slate-400 hover:text-red-500"
                        disabled={isUpserting}
                      ><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inactive employees (collapsed section) */}
      {inactive.length > 0 && (
        <details className="group rounded-lg border bg-white shadow-sm">
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600">
            {inactive.length} inactive / departed employee{inactive.length !== 1 ? "s" : ""}
            <span className="ml-1 text-slate-300 group-open:hidden">▸</span>
            <span className="ml-1 hidden text-slate-300 group-open:inline">▾</span>
          </summary>
          <div className="border-t">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {inactive.map(emp => (
                  <tr key={emp.id} className="opacity-60 hover:bg-slate-50 hover:opacity-100">
                    <td className="px-3 py-2.5 font-medium text-slate-600">{emp.name}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{emp.defaultCrew || "—"}</td>
                    <td className="px-3 py-2.5 pr-4 text-right">
                      <button
                        onClick={() => setActive(emp, true)}
                        disabled={isUpserting}
                        className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                      >Reactivate</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {dbEmployees && dbEmployees.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-400 italic">No employees yet — use &ldquo;Load Default Roster&rdquo; to get started or add employees manually.</p>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function AvbDashboard() {
  const [tab, setTab] = useState<Tab>("summary");
  const [viewDay, setViewDay] = useState(0);
  const [importDay, setImportDay] = useState(0);
  const [weekEnd, setWeekEnd] = useState(thisSunday);
  const [wd, setWd] = useState<AvbWeekData>(() => defaultWeekData({}, DEFAULT_CREW_DEFS));
  const [csvSt, setCsvSt] = useState("");
  const [pdfSt, setPdfSt] = useState<Record<number,string>>({});
  const [cpFrom, setCpFrom] = useState("");
  const [cpTo, setCpTo] = useState("");
  const [isSeeding, setIsSeeding] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const { data: weeks=[], isLoading } = useAvbWeeks();
  const upsert = useUpsertAvbWeek();
  const del = useDeleteAvbWeek();

  const { data: dbEmployees } = useAvbEmployees();
  const upsertEmployee = useUpsertAvbEmployee();

  const { data: dbCrews } = useAvbCrews();
  const upsertCrew = useUpsertAvbCrew();
  const deleteCrew = useDeleteAvbCrew();

  // Use DB crews when available, fall back to defaults while loading or unset
  const crewDefs = useMemo<CrewDef[]>(() => {
    if (!dbCrews) return DEFAULT_CREW_DEFS;           // still loading
    if (dbCrews.length === 0) return DEFAULT_CREW_DEFS; // not seeded yet
    return dbCrews.filter(c => c.isActive);
  }, [dbCrews]);

  // Auto-seed default crews the first time DB confirms org has none saved.
  // Without this, the fallback shows defaults visually but they aren't in DB,
  // so adding a single crew would make all the others disappear.
  const hasAutoSeededCrews = useRef(false);
  useEffect(() => {
    if (dbCrews !== undefined && dbCrews.length === 0 && !hasAutoSeededCrews.current) {
      hasAutoSeededCrews.current = true;
      DEFAULT_CREW_DEFS.forEach((c, i) => upsertCrew.mutate({ code: c.code, name: c.name, sortOrder: i }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbCrews]);

  // Build the fallback roster from hardcoded ALL_EMP (used while DB is loading or empty)
  const fallbackEmployees = useMemo<AvbEmployee[]>(() =>
    ALL_EMP.map(e => ({
      id: e.uuid,
      uuid: e.uuid,
      name: e.name,
      csvName: e.csvName,
      csvJob: e.csvJob,
      defaultCrew: Object.entries(DEF_ASSIGNMENTS).find(([, v]) => v.includes(e.uuid))?.[0] ?? "",
      isField: !NON_FIELD_UUIDS.has(e.uuid),
      isActive: true,
    })),
    []
  );

  // Active employees for operational use: use DB data once seeded, fallback to hardcoded while loading
  const allEmp = useMemo<AvbEmployee[]>(() => {
    if (!dbEmployees) return fallbackEmployees;           // still loading
    if (dbEmployees.length === 0) return fallbackEmployees; // not seeded yet — show fallback
    return dbEmployees.filter(e => e.isActive);
  }, [dbEmployees, fallbackEmployees]);

  const fieldUuids = useMemo(() => allEmp.filter(e => e.isField).map(e => e.uuid), [allEmp]);

  // Compute default crew assignments from DB employee defaultCrew fields
  const defAssignments = useMemo<Record<string, string[]>>(() => {
    const result: Record<string, string[]> = Object.fromEntries(crewDefs.map(cr => [cr.code, []]));
    allEmp.filter(e => e.isField).forEach(emp => {
      if (emp.defaultCrew && emp.defaultCrew in result) {
        result[emp.defaultCrew].push(emp.uuid);
      }
    });
    return result;
  }, [allEmp, crewDefs]);

  const cur = weeks.length ? weeks[weeks.length-1] : null;

  // Keep wd in sync with defAssignments/crewDefs as long as no Gusto CSV has
  // been uploaded yet (weekStart null = fresh/blank import state). This makes
  // the Step 3 crew cards always reflect the current Settings assignments, and
  // ensures the "Import Week" tab button shows the right defaults even if the
  // user navigated there without clicking the action button.
  useEffect(() => {
    setWd(prev => {
      if (prev.gusto.weekStart !== null) return prev; // mid-import — don't overwrite
      return defaultWeekData(defAssignments, crewDefs);
    });
  }, [defAssignments, crewDefs]);

  // CSV
  const handleCsv = useCallback((file: File) => {
    const r = new FileReader();
    r.onload = ev => {
      try {
        const g = parseGustoCsv(ev.target!.result as string, allEmp);
        setCsvSt(`✓ ${Object.keys(g.employees).length} employees | ${g.weekStart} → ${g.weekEnd}`);
        if (g.weekEnd) setWeekEnd(g.weekEnd);
        setWd(d=>({...d,gusto:g}));
      } catch(e) { setCsvSt("Error: "+String(e)); }
    };
    r.readAsText(file);
  }, [allEmp]);

  // PDF
  const handlePdf = useCallback(async (file: File, di: number) => {
    setPdfSt(s=>({...s,[di]:"Parsing…"}));
    try {
      const crews = await parseAvbPdf(file, crewDefs.map(c => c.code));
      const found = Object.keys(crews);
      if (!found.length) throw new Error("No crew data found");
      setWd(d=>{
        const next={...d,days:{...d.days}};
        const day={...next.days[di],avb:{...next.days[di].avb}};
        found.forEach(code=>{day.avb[code]={...crews[code]};});
        next.days[di]=day; return next;
      });
      setPdfSt(s=>({...s,[di]:`✓ ${found.join(", ")}`}));
    } catch(e) { setPdfSt(s=>({...s,[di]:"Error: "+String(e)})); }
  }, [crewDefs]);

  // Assignment helpers
  const addToCrew = useCallback((di: number, code: string, uuid: string) => setWd(d=>{
    const next={...d,days:{...d.days}};
    const day={...next.days[di],assignments:Object.fromEntries(Object.entries(next.days[di].assignments).map(([k,v])=>[k,v.filter(u=>u!==uuid)]))};
    day.assignments[code]=[...day.assignments[code],uuid];
    next.days[di]=day; return next;
  }), []);

  const rmFromCrew = useCallback((di: number, code: string, uuid: string) => setWd(d=>{
    const next={...d,days:{...d.days}};
    const day={...next.days[di],assignments:{...next.days[di].assignments}};
    day.assignments[code]=day.assignments[code].filter(u=>u!==uuid);
    next.days[di]=day; return next;
  }), []);

  const setAvb = useCallback((di: number, code: string, field: AvbField, val: string) => setWd(d=>{
    const next={...d,days:{...d.days}};
    const day={...next.days[di],avb:{...next.days[di].avb}};
    day.avb[code]={...day.avb[code],[field]:pf(val)};
    next.days[di]=day; return next;
  }), []);

  const setEmpHours = useCallback((uuid: string, di: number, total: number, regular: number, ot: number) => {
    setWd(d => {
      const dk = d.gusto.weekStart ? dayKey(d.gusto.weekStart, di) : null;
      if (!dk) return d;
      const next = { ...d, gusto: { ...d.gusto, employees: { ...d.gusto.employees } } };
      const existing = next.gusto.employees[uuid] ?? { total: 0, regular: 0, ot: 0, days: [] };
      const otherDays = existing.days.filter(x => x.date !== dk);
      const updatedDays = total > 0 || regular > 0 || ot > 0
        ? [...otherDays, { date: dk, total, regular, ot, mealBreak: 0, timeRange: "", job: "" }]
        : otherDays;
      const newTotal    = updatedDays.reduce((s, x) => s + x.total, 0);
      const newRegular  = updatedDays.reduce((s, x) => s + x.regular, 0);
      const newOt       = updatedDays.reduce((s, x) => s + x.ot, 0);
      next.gusto.employees[uuid] = { ...existing, total: newTotal, regular: newRegular, ot: newOt, days: updatedDays };
      return next;
    });
  }, []);

  const copyAssignments = useCallback(() => {
    if (!cpFrom||!cpTo) return;
    setWd(d=>{
      const next={...d,days:{...d.days}};
      next.days[parseInt(cpTo)]={...next.days[parseInt(cpTo)],assignments:JSON.parse(JSON.stringify(next.days[parseInt(cpFrom)].assignments))};
      return next;
    });
  }, [cpFrom, cpTo]);

  const saveWeek = useCallback(async () => {
    if (!weekEnd) return;
    try {
      await upsert.mutateAsync({weekEnd,data:wd});
      setTab("summary");
    } catch(e) {
      alert("Save failed: " + String(e));
    }
  }, [weekEnd, wd, upsert]);

  const handleEditWeek = useCallback((w: AvbWeek) => {
    setWd(w.data);
    setWeekEnd(w.weekEnd);
    setImportDay(0);
    setCsvSt("");
    setPdfSt({});
    setTab("import");
  }, []);

  const handleImportNew = useCallback(() => {
    // Reset wd to a fresh week (clears any in-progress gusto data so the
    // useEffect above re-applies current defAssignments).
    setWd(defaultWeekData(defAssignments, crewDefs));
    setImportDay(0);
    setCsvSt("");
    setPdfSt({});
    setTab("import");
  }, [defAssignments, crewDefs]);

  const handleDeleteWeek = useCallback((we: string) => {
    del.mutate(we);
  }, [del]);

  const handleUpsertEmployee = useCallback((emp: UpsertEmpPayload) => {
    upsertEmployee.mutate(emp);
  }, [upsertEmployee]);

  const handleUpsertCrew = useCallback((c: UpsertCrewPayload) => {
    upsertCrew.mutate(c);
  }, [upsertCrew]);

  const handleDeleteCrew = useCallback((id: string) => {
    deleteCrew.mutate(id);
  }, [deleteCrew]);

  const handleSeedRoster = useCallback(async () => {
    setIsSeeding(true);
    try {
      await Promise.all(ALL_EMP.map(emp => {
        const defCrew = Object.entries(DEF_ASSIGNMENTS).find(([, v]) => v.includes(emp.uuid))?.[0] ?? "";
        return upsertEmployee.mutateAsync({
          uuid: emp.uuid,
          name: emp.name,
          csvName: emp.csvName,
          csvJob: emp.csvJob,
          defaultCrew: defCrew,
          isField: !NON_FIELD_UUIDS.has(emp.uuid),
          isActive: true,
        });
      }));
    } finally {
      setIsSeeding(false);
    }
  }, [upsertEmployee]);

  const TABS: {key:Tab;label:string}[] = [
    {key:"summary",  label:"Weekly Summary"},
    {key:"daily",    label:"Daily View"},
    {key:"history",  label:"History & Trends"},
    {key:"ytd",      label:"YTD Summary"},
    {key:"import",   label:"Import Week"},
    {key:"settings", label:"Team Settings"},
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Labor Efficiency"
        description="Compare on-site production hours against Gusto clocked hours by crew"
        action={<button onClick={handleImportNew} className="flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"><Upload className="h-4 w-4"/>Import Week</button>}
      />
      <div className="flex gap-0 overflow-x-auto border-b border-slate-200">
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} className={`shrink-0 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab===t.key?"border-brand-500 text-brand-600":"border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>
        ))}
      </div>
      {isLoading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          {tab==="summary"  && <Summary cur={cur} employees={allEmp} crewDefs={crewDefs} onEditWeek={handleEditWeek} onImportNew={handleImportNew} />}
          {tab==="daily"    && <Daily cur={cur} employees={allEmp} crewDefs={crewDefs} viewDay={viewDay} setViewDay={setViewDay} />}
          {tab==="history"  && <History weeks={weeks} crewDefs={crewDefs} onEditWeek={handleEditWeek} onDeleteWeek={handleDeleteWeek} />}
          {tab==="ytd"      && <Ytd weeks={weeks} crewDefs={crewDefs} />}
          {tab==="import"   && (
            <Import
              wd={wd}
              employees={allEmp}
              crewDefs={crewDefs}
              fieldUuids={fieldUuids}
              importDay={importDay}
              setImportDay={setImportDay}
              weekEnd={weekEnd}
              setWeekEnd={setWeekEnd}
              csvSt={csvSt}
              pdfSt={pdfSt}
              cpFrom={cpFrom}
              setCpFrom={setCpFrom}
              cpTo={cpTo}
              setCpTo={setCpTo}
              csvRef={csvRef}
              pdfRef={pdfRef}
              onCsvFile={handleCsv}
              onPdfFile={handlePdf}
              onCopyAssignments={copyAssignments}
              onSave={saveWeek}
              isSaving={upsert.isPending}
              onSetAvb={setAvb}
              onAddToCrew={addToCrew}
              onRmFromCrew={rmFromCrew}
              onSetEmpHours={setEmpHours}
              onCancel={()=>setTab("summary")}
            />
          )}
          {tab==="settings" && (
            <Settings
              crewDefs={crewDefs}
              dbCrews={dbCrews}
              dbEmployees={dbEmployees}
              onUpsert={handleUpsertEmployee}
              isUpserting={upsertEmployee.isPending}
              onSeedRoster={handleSeedRoster}
              isSeeding={isSeeding}
              onUpsertCrew={handleUpsertCrew}
              onDeleteCrew={handleDeleteCrew}
              isUpsertingCrew={upsertCrew.isPending || deleteCrew.isPending}
            />
          )}
        </>
      )}
    </div>
  );
}
