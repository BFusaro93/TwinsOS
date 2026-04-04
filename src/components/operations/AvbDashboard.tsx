"use client";

import { useState, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Upload, FileText, CheckCircle2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  useAvbWeeks, useUpsertAvbWeek, useDeleteAvbWeek,
  type AvbWeekData, type DayData, type GustoData,
} from "@/lib/hooks/use-avb-weeks";
import { cn } from "@/lib/utils";

const CREW_DEFS = [
  { code: "MAINT1", name: "Maintenance 1" }, { code: "MAINT2", name: "Maintenance 2" },
  { code: "MAINT3", name: "Maintenance 3" }, { code: "MAINT4", name: "Maintenance 4" },
  { code: "MAINT5", name: "Maintenance 5" }, { code: "FERT1",  name: "Fert / Weed Control" },
  { code: "LNDSCP1",name: "Landscape Construction" }, { code: "ENH1", name: "Enhancement 1" },
] as const;
type CrewCode = typeof CREW_DEFS[number]["code"];

const ALL_EMP = [
  { uuid: "87a264e0", name: "Rolando Alvarado",    csvName: "Alvarado, Rolando",                  csvJob: "Maintenance Crew Member"  },
  { uuid: "b54b3f88", name: "Ryan Auger",           csvName: "Auger, Ryan"                                                           },
  { uuid: "6d5ded40", name: "Otilio Brizuela",      csvName: "Brizuela, Jose",                     csvJob: "Maintenance Crew Leader"  },
  { uuid: "55f28eee", name: "James Brizuela",       csvName: "Brizuela, Jose",                     csvJob: "Maintenance Crew Member"  },
  { uuid: "529bbd5c", name: "Mauricio Cruz",        csvName: "Cruz, Mauricio"                                                        },
  { uuid: "36a5a673", name: "Julio Escobar",        csvName: "Escobar, Julio"                                                        },
  { uuid: "695866b9", name: "Tyler Haywood",        csvName: "Haywood, Tyler"                                                        },
  { uuid: "3540efab", name: "Olvin Hernandez",      csvName: "Hernandez, Olvin"                                                      },
  { uuid: "b5ad4fb2", name: "Casey Kleinman",       csvName: "Kleinman, Casey"                                                       },
  { uuid: "38f06eb7", name: "Steve Krikorian II",   csvName: "Krikorian II, Stephen"                                                 },
  { uuid: "41c55955", name: "Nelson Labelle",       csvName: "Labelle, Nelson"                                                       },
  { uuid: "2f1c79d8", name: "Jose Leiva",           csvName: "Leiva, Jose",                        csvJob: "Maintenance Crew Leader"  },
  { uuid: "9c3e8613", name: "Saul Leiva",           csvName: "Leiva, Saul"                                                           },
  { uuid: "3c084d9d", name: "Cam MacDonald",        csvName: "MacDonald, Camden"                                                     },
  { uuid: "ad9b1c2e", name: "Eduard Martinez",      csvName: "Martinez Mejia, Eduard"                                                },
  { uuid: "69b0adca", name: "Marvin Mejia Lopez",   csvName: "Mejia Lopez, Marvin"                                                   },
  { uuid: "fde97e65", name: "Encarnacion Membrano", csvName: "Membrano Martinez, Encarnacion Cruz"                                   },
  { uuid: "d3b6869a", name: "Zackery Pervier",      csvName: "Pervier, Zackery"                                                      },
  { uuid: "32d07880", name: "Luis Pineda",          csvName: "Pineda, Luis"                                                          },
  { uuid: "f776a380", name: "Wilder Pineda",        csvName: "Pineda, Wilder"                                                        },
  { uuid: "c25bbf8d", name: "Juan Polanco Molina",  csvName: "Polanco Molina, Juan"                                                  },
  { uuid: "418e5fac", name: "Esdras Ramos Pacheco", csvName: "Ramos Pacheco, Esdras"                                                 },
  { uuid: "0bfcb8df", name: "Jason Rodriguez",      csvName: "Rodriguez, Jason"                                                      },
  { uuid: "875c4721", name: "Juan Sanchez",         csvName: "Sanchez, Juan"                                                         },
  { uuid: "9695004c", name: "Mark Wiggins",         csvName: "Wiggins, Mark"                                                         },
];

const FIELD_UUIDS = ALL_EMP.filter(e => !["b5ad4fb2","3c084d9d"].includes(e.uuid)).map(e => e.uuid);

const DEF_ASSIGN: Record<CrewCode, string[]> = {
  MAINT1:[], MAINT2:["6d5ded40","529bbd5c","36a5a673"],
  MAINT3:["2f1c79d8","9c3e8613","ad9b1c2e","fde97e65","875c4721"],
  MAINT4:["32d07880","f776a380","c25bbf8d","87a264e0"], MAINT5:[],
  FERT1:["695866b9"], LNDSCP1:["41c55955","b54b3f88","38f06eb7"],
  ENH1:["d3b6869a","418e5fac","0bfcb8df","9695004c"],
};

const WDAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const CREW_COLORS=["#3b82f6","#22c55e","#ef4444","#f59e0b","#a78bfa","#60ab45","#06b6d4","#ec4899"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function pf(v: unknown): number { return parseFloat(String(v??"").replace(",",""))||0; }
function fmtDate(s: string) { return new Date(s+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
function dayKey(ws: string, idx: number) {
  const d=new Date(ws+"T12:00:00"); d.setDate(d.getDate()+idx);
  return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${String(d.getFullYear()).slice(2)}`;
}
function dayIso(ws: string, idx: number) { const d=new Date(ws+"T12:00:00"); d.setDate(d.getDate()+idx); return d.toISOString().split("T")[0]; }
function dayLabel(ws: string|null, idx: number) {
  if(!ws) return WDAYS[idx];
  const d=new Date(ws+"T12:00:00"); d.setDate(d.getDate()+idx);
  return `${WDAYS[idx]} ${d.getMonth()+1}/${d.getDate()}`;
}
function getEmp(uuid: string) { return ALL_EMP.find(e=>e.uuid===uuid); }
function matchUuid(csvName: string, job: string): string|null {
  const ex=ALL_EMP.find(e=>e.csvName===csvName&&e.csvJob&&e.csvJob===job); if(ex) return ex.uuid;
  const bn=ALL_EMP.filter(e=>e.csvName===csvName);
  if(bn.length===1) return bn[0].uuid;
  if(bn.length>1){const jm=bn.find(e=>!e.csvJob||job.includes(e.csvJob||"")); return jm?.uuid??bn[0].uuid;}
  const last=csvName.split(",")[0].toLowerCase();
  return ALL_EMP.find(e=>e.name.toLowerCase().includes(last))?.uuid??null;
}
function empHrsDI(gusto: GustoData, uuid: string, dayIdx: number) {
  if(!gusto.weekStart) return 0;
  const dk=dayKey(gusto.weekStart,dayIdx);
  return gusto.employees[uuid]?.days.find(d=>d.date===dk)?.total??0;
}
function epColor(ep: number|null) {
  if(ep===null) return "text-slate-400";
  return ep>=88?"text-green-600":ep>=75?"text-yellow-600":"text-red-600";
}
function effBadge(ep: number|null) {
  if(ep===null) return <span className="text-slate-400">—</span>;
  const cls=ep>=88?"bg-green-50 text-green-700":ep>=75?"bg-yellow-50 text-yellow-700":"bg-red-50 text-red-600";
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold",cls)}>{ep}%</span>;
}
function gDate(s: string) { const p=s.split("/"); const yr=p[2].length===2?"20"+p[2]:p[2]; return `${yr}-${p[0].padStart(2,"0")}-${p[1].padStart(2,"0")}`; }
function csvRow(row: string): string[] {
  const out: string[]=[]; let cur=""; let q=false;
  for(const c of row){if(c==='"'){q=!q;}else if(c===","&&!q){out.push(cur.trim());cur="";}else cur+=c;}
  out.push(cur.trim()); return out;
}
function thisSunday() { const d=new Date(),s=new Date(d); s.setDate(d.getDate()+(7-d.getDay())%7); return s.toISOString().split("T")[0]; }

// ── CSV Parser ────────────────────────────────────────────────────────────────
function parseGustoCsv(text: string): GustoData {
  const lines=text.split("\n").map(l=>l.trim());
  const result: GustoData={weekStart:null,weekEnd:null,employees:{}};
  function emp(uuid: string) { if(!result.employees[uuid]) result.employees[uuid]={total:0,regular:0,ot:0,days:[]}; return result.employees[uuid]; }
  for(let i=0;i<lines.length;i++){
    const l=lines[i].replace(/"/g,"");
    if(l.startsWith("Date range,")){const pts=l.split(",")[1].split("-"); result.weekStart=gDate(pts[0].trim()); result.weekEnd=gDate(pts[1].trim());}
    if(l.startsWith("Name,Manager")){
      i++;
      while(i<lines.length){
        const raw=lines[i].replace(/"/g,"");
        if(!raw||raw.startsWith("Hours for")){i--;break;}
        const c=csvRow(lines[i]);
        if(c.length>=3&&c[0]&&c[0]!=="Name"){
          const parts=c[0].trim().split(" ");
          const lf=parts.length>1?parts.slice(1).join(" ")+", "+parts[0]:c[0];
          const uuid=matchUuid(lf,c[9]??"");
          if(uuid){emp(uuid).total+=pf(c[2]);emp(uuid).regular+=pf(c[3]);emp(uuid).ot+=pf(c[4]);}
        }
        i++;
      }
    }
    const hm=l.match(/^Hours for (.+)$/);
    if(hm){
      i+=2; const daily: GustoData["employees"][string]["days"]=[];
      while(i<lines.length){
        const raw=lines[i].replace(/"/g,"");
        if(!raw||raw.startsWith("Hours for")){i--;break;}
        const c=csvRow(lines[i]);
        if(c.length>=3&&c[0]&&/\d{2}\/\d{2}\/\d{2}/.test(c[0]))
          daily.push({date:c[0],total:pf(c[1]),regular:pf(c[2]),ot:pf(c[3]),mealBreak:pf(c[7]),timeRange:c[11]??"",job:c[12]??""});
        i++;
      }
      const nm=hm[1].trim(); const job=daily.find(d=>d.job)?.job??"";
      const uuid=matchUuid(nm,job); if(uuid) emp(uuid).days=daily;
    }
  }
  return result;
}

// ── PDF Parser (loads pdf.js from CDN) ───────────────────────────────────────
let pdfjsReady=false;
async function loadPdfJs() {
  if(pdfjsReady||(window as Record<string,unknown>).pdfjsLib){pdfjsReady=true;return;}
  await new Promise<void>((res,rej)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload=()=>{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      pdfjsReady=true; res();
    };
    s.onerror=()=>rej(new Error("Failed to load pdf.js")); document.head.appendChild(s);
  });
}
async function parseAvbPdf(file: File): Promise<Record<string,{budgeted:number;actual:number;revenue:number}>> {
  await loadPdfJs();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib=(window as any).pdfjsLib;
  const buf=await file.arrayBuffer();
  const pdf=await lib.getDocument({data:buf}).promise;
  let txt="";
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const tc=await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items=(tc.items as any[]).map((i: any)=>({x:Math.round(i.transform[4]),y:Math.round(i.transform[5]),str:i.str as string}));
    items.sort((a,b)=>b.y-a.y||a.x-b.x);
    const lm: Record<number,typeof items>={};
    items.forEach(it=>{const yk=Math.round(it.y/4)*4;if(!lm[yk])lm[yk]=[];lm[yk].push(it);});
    Object.keys(lm).map(Number).sort((a,b)=>b-a).forEach(y=>{lm[y].sort((a,b)=>a.x-b.x);txt+=lm[y].map((i:{str:string})=>i.str).join(" ")+"\n";});
  }
  const lines=txt.split("\n"); const results: Record<string,{budgeted:number;actual:number;revenue:number}>={};
  const SA=/Sum:.*Sum:.*Sum:/i,CR=/^\s*(FERT\d*|LNDSCP\d*|MAINT\d*|ENH\d*)\s*$/i,NR=/([\d,]+\.\d{2,4})/g,DR=/\$([\d,]+\.\d{2})/;
  for(let i=0;i<lines.length-2;i++){
    if(SA.test(lines[i])){
      const cm=CR.exec(lines[i+1]);
      if(cm){const crew=cm[1].toUpperCase();if(results[crew])continue;
        const nums=[...lines[i+2].matchAll(NR)].map(m=>parseFloat(m[1].replace(",","")));
        const dm=DR.exec(lines[i+2]);
        if(nums.length>=2) results[crew]={budgeted:nums[0],actual:nums[1],revenue:dm?parseFloat(dm[1].replace(",","")): 0};
      }
    }
  }
  return results;
}

// ── Data factories ────────────────────────────────────────────────────────────
function makeEmpty(): AvbWeekData {
  const days: Record<number,DayData>={};
  for(let i=0;i<7;i++){
    const assignments: Record<string,string[]>={};
    const avb: Record<string,{budgeted:number;actual:number;revenue:number}>={};
    for(const cr of CREW_DEFS){assignments[cr.code]=[...(DEF_ASSIGN[cr.code as CrewCode]??[])];avb[cr.code]={budgeted:0,actual:0,revenue:0};}
    days[i]={assignments,avb};
  }
  return{days,gusto:{weekStart:null,weekEnd:null,employees:{}}};
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Kpi({label,value,sub,colorClass}:{label:string;value:string;sub?:string;colorClass?:string}){
  return(
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn("mt-2 text-3xl font-bold",colorClass??"text-slate-900")}>{value}</p>
      {sub&&<p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
function DayPill({label,active,hasAvb,onClick}:{label:string;active:boolean;hasAvb:boolean;onClick:()=>void}){
  return(
    <button onClick={onClick} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      active?"border-brand-500 bg-brand-500 text-white":
      hasAvb?"border-green-500 text-green-700 hover:bg-green-50":
      "border-slate-200 text-slate-500 hover:bg-slate-50"
    )}>{label}</button>
  );
}

type Tab="summary"|"daily"|"history"|"import";

// ── Main ──────────────────────────────────────────────────────────────────────
export function AvbDashboard(){
  const {data:weeks=[],isLoading}=useAvbWeeks();
  const upsert=useUpsertAvbWeek();
  const del=useDeleteAvbWeek();
  const [tab,setTab]=useState<Tab>("summary");
  const [selWeek,setSelWeek]=useState<string|null>(null);
  const [vDay,setVDay]=useState(0);
  const [iDay,setIDay]=useState(0);
  const [iWeekEnd,setIWeekEnd]=useState(thisSunday());
  const [iData,setIData]=useState<AvbWeekData>(makeEmpty());
  const [csvSt,setCsvSt]=useState("");
  const [avbSt,setAvbSt]=useState<Record<number,string>>({});
  const [cpFrom,setCpFrom]=useState("");
  const [cpTo,setCpTo]=useState("");

  const curWeek=weeks.find(w=>w.weekEnd===selWeek)??weeks[weeks.length-1]??null;

  function crewTotals(w: typeof curWeek){
    if(!w) return {} as Record<string,{budgeted:number;actual:number;revenue:number;gusto:number;ot:number}>;
    const out: Record<string,{budgeted:number;actual:number;revenue:number;gusto:number;ot:number}>={};
    for(const cr of CREW_DEFS) out[cr.code]={budgeted:0,actual:0,revenue:0,gusto:0,ot:0};
    for(let d=0;d<7;d++){
      const day=w.data.days[d]; if(!day) continue;
      for(const cr of CREW_DEFS){
        const avb=day.avb[cr.code]??{budgeted:0,actual:0,revenue:0};
        out[cr.code].budgeted+=pf(avb.budgeted);out[cr.code].actual+=pf(avb.actual);out[cr.code].revenue+=pf(avb.revenue);
        for(const uuid of day.assignments[cr.code]??[]){
          out[cr.code].gusto+=empHrsDI(w.data.gusto,uuid,d);
          const dk=w.data.gusto.weekStart?dayKey(w.data.gusto.weekStart,d):null;
          const de=dk?w.data.gusto.employees[uuid]?.days.find(x=>x.date===dk):null;
          if(de) out[cr.code].ot+=de.ot;
        }
      }
    }
    return out;
  }

  const handleCsv=useCallback((file: File)=>{
    const r=new FileReader();
    r.onload=ev=>{
      try{const g=parseGustoCsv(ev.target!.result as string);
        setCsvSt(`✓ ${Object.keys(g.employees).length} employees | ${g.weekStart} → ${g.weekEnd}`);
        if(g.weekEnd) setIWeekEnd(g.weekEnd);
        setIData(p=>({...p,gusto:g}));
      }catch(e){setCsvSt(`Error: ${(e as Error).message}`);}
    };
    r.readAsText(file);
  },[]);

  const handlePdf=useCallback(async(file:File,di:number)=>{
    setAvbSt(p=>({...p,[di]:"Parsing…"}));
    try{
      const crews=await parseAvbPdf(file);
      const found=Object.keys(crews); if(!found.length) throw new Error("No crew data found");
      setIData(p=>{const n={...p,days:{...p.days}};const day={...n.days[di]};const avb={...day.avb};for(const code of found)avb[code]=crews[code];day.avb=avb;n.days[di]=day;return n;});
      setAvbSt(p=>({...p,[di]:`✓ ${found.join(", ")}`}));
    }catch(e){setAvbSt(p=>({...p,[di]:`Error: ${(e as Error).message}`}));}
  },[]);

  const handleSave=useCallback(async()=>{
    if(!iWeekEnd) return;
    await upsert.mutateAsync({weekEnd:iWeekEnd,data:iData});
    setSelWeek(iWeekEnd); setTab("summary");
  },[iWeekEnd,iData,upsert]);

  function copyDay(){
    const f=parseInt(cpFrom),t=parseInt(cpTo); if(isNaN(f)||isNaN(t)) return;
    setIData(p=>{const n={...p,days:{...p.days}};n.days[t]={...n.days[t],assignments:JSON.parse(JSON.stringify(n.days[f].assignments))};return n;});
  }
  function addEmp(di:number,code:string,uuid:string){
    setIData(p=>{const n={...p,days:{...p.days}};const day={assignments:{...n.days[di].assignments},avb:n.days[di].avb};
      for(const cr of CREW_DEFS) day.assignments[cr.code]=(day.assignments[cr.code]??[]).filter(u=>u!==uuid);
      day.assignments[code]=[...(day.assignments[code]??[]),uuid];n.days[di]=day;return n;});
  }
  function rmEmp(di:number,code:string,uuid:string){
    setIData(p=>{const n={...p,days:{...p.days}};const day={assignments:{...n.days[di].assignments},avb:n.days[di].avb};
      day.assignments[code]=(day.assignments[code]??[]).filter(u=>u!==uuid);n.days[di]=day;return n;});
  }
  function setAvb(di:number,code:string,field:"budgeted"|"actual"|"revenue",val:string){
    setIData(p=>{const n={...p,days:{...p.days}};const day={assignments:n.days[di].assignments,avb:{...n.days[di].avb}};
      day.avb[code]={...(day.avb[code]??{budgeted:0,actual:0,revenue:0}),[field]:pf(val)};n.days[di]=day;return n;});
  }

  const ct=crewTotals(curWeek);
  const totG=Object.values(ct).reduce((s,c)=>s+c.gusto,0);
  const totO=Object.values(ct).reduce((s,c)=>s+c.actual,0);
  const totB=Object.values(ct).reduce((s,c)=>s+c.budgeted,0);
  const totEff=totG>0?Math.round(totO/totG*100):null;
  const totGap=totG>0?totG-totO:null;
  const totAvb=totO-totB;
  const ws=curWeek?.data.gusto.weekStart??null;
  const iDay0=iData.days[iDay]??{assignments:{},avb:{}};

  const tabs:[Tab,string][]=[["summary","Weekly Summary"],["daily","Daily View"],["history","History & Trends"],["import","Import Week"]];

  return(
    <div className="flex flex-col gap-6">
      <PageHeader title="AvB × Gusto — Crew Hours" description="Daily on-site vs clocked hours by crew"
        action={
          <div className="flex items-center gap-2">
            {weeks.length>1&&(
              <select value={selWeek??curWeek?.weekEnd??""} onChange={e=>setSelWeek(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm">
                {weeks.slice().reverse().map(w=><option key={w.weekEnd} value={w.weekEnd}>Week of {fmtDate(w.weekEnd)}</option>)}
              </select>
            )}
            <button onClick={()=>{setIData(makeEmpty());setCsvSt("");setAvbSt({});setTab("import");}}
              className="flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
              <Upload className="h-3.5 w-3.5"/>Import week
            </button>
          </div>
        }
      />

      <div className="flex border-b border-slate-200">
        {tabs.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={cn("border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab===k?"border-brand-500 text-brand-600":"border-transparent text-slate-500 hover:text-slate-700")}>
            {l}
          </button>
        ))}
      </div>

      {/* ── SUMMARY ── */}
      {tab==="summary"&&(
        <div className="flex flex-col gap-6">
          {!curWeek&&!isLoading&&(
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">
              No week loaded — use &ldquo;Import week&rdquo; to get started.
            </div>
          )}
          {curWeek&&(
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <Kpi label="Gusto Clocked" value={totG.toFixed(1)} sub="hrs total"/>
                <Kpi label="On-Site (AvB)" value={totO.toFixed(1)} sub="hrs scheduled"/>
                <Kpi label="Indirect Gap" value={totGap!==null?(totGap>=0?"+":"")+totGap.toFixed(1):"—"} sub="clocked minus on-site"
                  colorClass={totGap!==null?(Math.abs(totGap)>10?"text-red-600":"text-green-600"):undefined}/>
                <Kpi label="Labor Efficiency" value={totEff!==null?totEff+"%":"—"} sub="on-site ÷ clocked" colorClass={epColor(totEff)}/>
                <Kpi label="AvB Variance" value={(totAvb>=0?"+":"")+totAvb.toFixed(1)} sub="actual minus budgeted"
                  colorClass={totAvb>=0?"text-green-600":"text-red-600"}/>
              </div>

              {/* Crew table */}
              <div className="rounded-lg border bg-white shadow-sm">
                <div className="border-b px-5 py-3"><p className="text-sm font-semibold text-slate-700">Crew Summary — Week Total</p></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 text-left">Crew</th>
                      <th className="px-4 py-3 text-right">Budgeted</th><th className="px-4 py-3 text-right">On-Site</th>
                      <th className="px-4 py-3 text-right">AvB Var</th><th className="px-4 py-3 text-right">Gusto Clocked</th>
                      <th className="px-4 py-3 text-right">Indirect Gap</th><th className="px-4 py-3 text-right">Efficiency</th>
                      <th className="px-4 py-3 text-right">OT</th><th className="px-4 py-3 text-right">Revenue</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {CREW_DEFS.map(cr=>{
                        const t=ct[cr.code]??{budgeted:0,actual:0,revenue:0,gusto:0,ot:0};
                        const av=t.actual-t.budgeted,gap=t.gusto>0?t.gusto-t.actual:null,eff=t.gusto>0?Math.round(t.actual/t.gusto*100):null;
                        return(
                          <tr key={cr.code} className="hover:bg-slate-50">
                            <td className="px-4 py-3"><span className="font-semibold">{cr.code}</span><span className="ml-2 text-xs text-slate-400">{cr.name}</span></td>
                            <td className="px-4 py-3 text-right text-slate-500">{t.budgeted>0?t.budgeted.toFixed(1):"—"}</td>
                            <td className="px-4 py-3 text-right font-medium">{t.actual>0?t.actual.toFixed(1):"—"}</td>
                            <td className="px-4 py-3 text-right">{t.budgeted>0?<span className={av>=0?"text-green-600 font-medium":"text-red-600 font-medium"}>{av>=0?"+":""}{av.toFixed(1)}</span>:"—"}</td>
                            <td className="px-4 py-3 text-right text-slate-500">{t.gusto>0?t.gusto.toFixed(1):"—"}</td>
                            <td className="px-4 py-3 text-right">{gap!==null?<span className={Math.abs(gap)>3?"text-red-600 font-medium":Math.abs(gap)>1?"text-yellow-600":"text-green-600"}>{gap>=0?"+":""}{gap.toFixed(1)}</span>:"—"}</td>
                            <td className="px-4 py-3 text-right">{effBadge(eff)}</td>
                            <td className="px-4 py-3 text-right">{t.ot>0?<span className="font-medium text-yellow-600">{t.ot.toFixed(1)}</span>:"—"}</td>
                            <td className="px-4 py-3 text-right">{t.revenue>0?`$${t.revenue.toLocaleString()}`:"—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Employee table */}
              <div className="rounded-lg border bg-white shadow-sm">
                <div className="border-b px-5 py-3"><p className="text-sm font-semibold text-slate-700">Employee Summary — Week Total</p></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 text-left">Employee</th><th className="px-4 py-3 text-left">Crews</th>
                      <th className="px-4 py-3 text-right">Total Hrs</th><th className="px-4 py-3 text-right">Regular</th>
                      <th className="px-4 py-3 text-right">OT</th><th className="px-4 py-3 text-right">Days</th><th className="px-4 py-3 text-right">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {ALL_EMP.map(emp=>{
                        const ed=curWeek.data.gusto.employees[emp.uuid];
                        const cs=new Set<string>();
                        for(let d=0;d<7;d++) for(const cr of CREW_DEFS) if(curWeek.data.days[d]?.assignments[cr.code]?.includes(emp.uuid)) cs.add(cr.code);
                        if(!ed&&cs.size===0) return null;
                        const tot=ed?.total??0,ot=ed?.ot??0,dw=ed?.days.filter(d=>d.total>0).length??0;
                        return(
                          <tr key={emp.uuid} className={cn("hover:bg-slate-50",tot===0&&"text-slate-400")}>
                            <td className="px-4 py-3 font-medium">{emp.name}{ot>0&&<span className="ml-2 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-bold text-yellow-700">OT {ot.toFixed(1)}h</span>}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{[...cs].join(", ")||"—"}</td>
                            <td className="px-4 py-3 text-right font-medium">{tot>0?tot.toFixed(2):"—"}</td>
                            <td className="px-4 py-3 text-right">{ed?ed.regular.toFixed(2):"—"}</td>
                            <td className="px-4 py-3 text-right">{ot>0?<span className="text-yellow-600 font-medium">{ot.toFixed(2)}</span>:"—"}</td>
                            <td className="px-4 py-3 text-right">{dw>0?dw:"—"}</td>
                            <td className="px-4 py-3 text-right">
                              {tot===0?<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">absent</span>
                                :ot>0?<span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">OT</span>
                                :<span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">ok</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── DAILY ── */}
      {tab==="daily"&&(
        <div className="flex flex-col gap-4">
          {!curWeek?<div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">No week loaded.</div>:(
            <>
              <div className="flex flex-wrap gap-2">
                {Array.from({length:7},(_,i)=>(
                  <DayPill key={i} label={dayLabel(ws,i)} active={vDay===i}
                    hasAvb={CREW_DEFS.some(cr=>(curWeek.data.days[i]?.avb[cr.code]?.actual??0)>0)}
                    onClick={()=>setVDay(i)}/>
                ))}
              </div>
              {/* Crew day table */}
              <div className="rounded-lg border bg-white shadow-sm">
                <div className="border-b px-5 py-3"><p className="text-sm font-semibold text-slate-700">Crew Performance — {dayLabel(ws,vDay)}</p></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 text-left">Crew</th><th className="px-4 py-3 text-right">Budgeted</th>
                      <th className="px-4 py-3 text-right">On-Site</th><th className="px-4 py-3 text-right">AvB Var</th>
                      <th className="px-4 py-3 text-right">Gusto</th><th className="px-4 py-3 text-right">Efficiency</th><th className="px-4 py-3 text-right">Revenue</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {CREW_DEFS.map(cr=>{
                        const avb=curWeek.data.days[vDay]?.avb[cr.code]??{budgeted:0,actual:0,revenue:0};
                        const mem=curWeek.data.days[vDay]?.assignments[cr.code]??[];
                        const g=mem.reduce((s,u)=>s+empHrsDI(curWeek.data.gusto,u,vDay),0);
                        const av=avb.actual-avb.budgeted,eff=g>0?Math.round(avb.actual/g*100):null;
                        return(
                          <tr key={cr.code} className="hover:bg-slate-50">
                            <td className="px-4 py-3"><span className="font-semibold">{cr.code}</span><span className="ml-2 text-xs text-slate-400">{cr.name}</span></td>
                            <td className="px-4 py-3 text-right">{avb.budgeted>0?avb.budgeted.toFixed(1):"—"}</td>
                            <td className="px-4 py-3 text-right font-medium">{avb.actual>0?avb.actual.toFixed(1):"—"}</td>
                            <td className="px-4 py-3 text-right">{avb.budgeted>0?<span className={av>=0?"text-green-600":"text-red-600"}>{av>=0?"+":""}{av.toFixed(1)}</span>:"—"}</td>
                            <td className="px-4 py-3 text-right">{g>0?g.toFixed(1):"—"}</td>
                            <td className="px-4 py-3 text-right">{effBadge(eff)}</td>
                            <td className="px-4 py-3 text-right">{avb.revenue>0?`$${avb.revenue.toLocaleString()}`:"—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {/* Employee day table */}
              <div className="rounded-lg border bg-white shadow-sm">
                <div className="border-b px-5 py-3"><p className="text-sm font-semibold text-slate-700">Employee Detail — {dayLabel(ws,vDay)}</p></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 text-left">Employee</th><th className="px-4 py-3 text-left">Crew</th>
                      <th className="px-4 py-3 text-right">Total Hrs</th><th className="px-4 py-3 text-right">Regular</th>
                      <th className="px-4 py-3 text-right">OT</th><th className="px-4 py-3 text-right">Clock In</th>
                      <th className="px-4 py-3 text-right">Clock Out</th><th className="px-4 py-3 text-right">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {CREW_DEFS.flatMap(cr=>(curWeek.data.days[vDay]?.assignments[cr.code]??[]).map(uuid=>{
                        const emp=getEmp(uuid); if(!emp) return null;
                        const hrs=empHrsDI(curWeek.data.gusto,uuid,vDay);
                        const dk=ws?dayKey(ws,vDay):null;
                        const de=dk?curWeek.data.gusto.employees[uuid]?.days.find(x=>x.date===dk):null;
                        const ot=de?.ot??0; const [inT,outT]=de?.timeRange?.split(" - ")??["",""];
                        return(
                          <tr key={`${cr.code}-${uuid}`} className={cn("hover:bg-slate-50",hrs===0&&"text-slate-400")}>
                            <td className="px-4 py-3 font-medium">{emp.name}{ot>0&&<span className="ml-2 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-bold text-yellow-700">OT</span>}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{cr.code}</td>
                            <td className="px-4 py-3 text-right font-medium">{hrs>0?hrs.toFixed(2):"—"}</td>
                            <td className="px-4 py-3 text-right">{de?.regular?de.regular.toFixed(2):"—"}</td>
                            <td className="px-4 py-3 text-right">{ot>0?<span className="text-yellow-600 font-medium">{ot.toFixed(2)}</span>:"—"}</td>
                            <td className="px-4 py-3 text-right text-xs text-slate-500">{inT||"—"}</td>
                            <td className="px-4 py-3 text-right text-xs text-slate-500">{outT||"—"}</td>
                            <td className="px-4 py-3 text-right">
                              {hrs===0?<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">off</span>
                                :ot>0?<span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">OT</span>
                                :<span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">worked</span>}
                            </td>
                          </tr>
                        );
                      }))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── HISTORY ── */}
      {tab==="history"&&(
        <div className="flex flex-col gap-6">
          {weeks.length===0?(
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">No history yet. Import your first week to start tracking trends.</div>
          ):(
            <>
              {/* Efficiency chart */}
              <div className="rounded-lg border bg-white p-5 shadow-sm">
                <p className="mb-4 text-sm font-semibold text-slate-700">Labor Efficiency by Crew (on-site ÷ Gusto clocked)</p>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={weeks.map(w=>{const r: Record<string,unknown>={week:fmtDate(w.weekEnd)};for(const cr of CREW_DEFS){let g=0,o=0;for(let d=0;d<7;d++){o+=pf(w.data.days[d]?.avb[cr.code]?.actual);for(const u of w.data.days[d]?.assignments[cr.code]??[])g+=empHrsDI(w.data.gusto,u,d);}r[cr.code]=g>0?parseFloat((o/g*100).toFixed(1)):null;}return r;})} margin={{left:-10,right:8}}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                    <XAxis dataKey="week" tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={v=>v+"%"} tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false} domain={[0,110]}/>
                    <Tooltip formatter={(v:number)=>[v+"%"]} contentStyle={{fontSize:12,borderRadius:8}}/>
                    <Legend wrapperStyle={{fontSize:11}}/>
                    {CREW_DEFS.map((cr,i)=><Line key={cr.code} type="monotone" dataKey={cr.code} stroke={CREW_COLORS[i]} strokeWidth={2} dot={false} connectNulls/>)}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Hours bar */}
                <div className="rounded-lg border bg-white p-5 shadow-sm">
                  <p className="mb-4 text-sm font-semibold text-slate-700">On-Site vs Gusto Clocked — Company Total</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={weeks.map(w=>{let tO=0,tG=0;for(const cr of CREW_DEFS)for(let d=0;d<7;d++){tO+=pf(w.data.days[d]?.avb[cr.code]?.actual);for(const u of w.data.days[d]?.assignments[cr.code]??[])tG+=empHrsDI(w.data.gusto,u,d);}return{week:fmtDate(w.weekEnd),"On-site":tO,"Gusto clocked":tG};})} margin={{left:-10,right:8}}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                      <XAxis dataKey="week" tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={{fontSize:12,borderRadius:8}}/>
                      <Legend wrapperStyle={{fontSize:11}}/>
                      <Bar dataKey="On-site" fill="#60ab45" radius={[3,3,0,0]}/>
                      <Bar dataKey="Gusto clocked" fill="#3b82f6" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Variance bar */}
                <div className="rounded-lg border bg-white p-5 shadow-sm">
                  <p className="mb-4 text-sm font-semibold text-slate-700">AvB Variance by Crew</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={weeks.map(w=>{const r: Record<string,unknown>={week:fmtDate(w.weekEnd)};for(const cr of CREW_DEFS){let o=0,b=0;for(let d=0;d<7;d++){o+=pf(w.data.days[d]?.avb[cr.code]?.actual);b+=pf(w.data.days[d]?.avb[cr.code]?.budgeted);}r[cr.code]=b>0?parseFloat((o-b).toFixed(2)):null;}return r;})} margin={{left:-10,right:8}}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                      <XAxis dataKey="week" tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
                      <YAxis tickFormatter={v=>(v>=0?"+":"")+v} tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={{fontSize:12,borderRadius:8}}/>
                      <Legend wrapperStyle={{fontSize:11}}/>
                      {CREW_DEFS.map((cr,i)=><Bar key={cr.code} dataKey={cr.code} fill={CREW_COLORS[i]} radius={[3,3,0,0]}/>)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Weekly log */}
              <div className="rounded-lg border bg-white shadow-sm">
                <div className="border-b px-5 py-3"><p className="text-sm font-semibold text-slate-700">Weekly Log</p></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 text-left">Week</th><th className="px-4 py-3 text-right">Budgeted</th>
                      <th className="px-4 py-3 text-right">On-Site</th><th className="px-4 py-3 text-right">Gusto Clocked</th>
                      <th className="px-4 py-3 text-right">Indirect Gap</th><th className="px-4 py-3 text-right">Efficiency</th><th/>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {weeks.slice().reverse().map(w=>{
                        let tG=0,tO=0,tB=0;
                        for(const cr of CREW_DEFS)for(let d=0;d<7;d++){tO+=pf(w.data.days[d]?.avb[cr.code]?.actual);tB+=pf(w.data.days[d]?.avb[cr.code]?.budgeted);for(const u of w.data.days[d]?.assignments[cr.code]??[])tG+=empHrsDI(w.data.gusto,u,d);}
                        const eff=tG>0?Math.round(tO/tG*100):null,gap=tG>0?tG-tO:null;
                        return(
                          <tr key={w.weekEnd} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium">Week of {fmtDate(w.weekEnd)}</td>
                            <td className="px-4 py-3 text-right">{tB.toFixed(1)}</td><td className="px-4 py-3 text-right">{tO.toFixed(1)}</td>
                            <td className="px-4 py-3 text-right">{tG>0?tG.toFixed(1):"—"}</td>
                            <td className="px-4 py-3 text-right">{gap!==null?(gap>=0?"+":"")+gap.toFixed(1):"—"}</td>
                            <td className="px-4 py-3 text-right">{effBadge(eff)}</td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={()=>{if(confirm(`Delete week of ${fmtDate(w.weekEnd)}?`))del.mutate(w.weekEnd);}} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4"/></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── IMPORT ── */}
      {tab==="import"&&(
        <div className="flex flex-col gap-4 max-w-5xl">
          {/* CSV */}
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-slate-700">Step 1 — Upload Gusto CSV (whole week)</p>
            <p className="mb-3 text-xs text-slate-400">Time Tracking → Reports → Hours → Weekly on Thursday → Download CSV</p>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-slate-200 p-4 hover:border-brand-400 hover:bg-brand-50 transition-colors">
              <FileText className="h-5 w-5 text-slate-400"/>
              <span className="text-sm text-slate-500">Drop Gusto weekly CSV here or click to browse</span>
              <input type="file" accept=".csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)handleCsv(f);}}/>
            </label>
            {csvSt&&<p className={cn("mt-2 text-xs",csvSt.startsWith("✓")?"text-green-600":"text-red-600")}>{csvSt}</p>}
          </div>

          {/* Week date */}
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-slate-700">Step 2 — Week Ending Date</p>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium uppercase tracking-wider text-slate-500">Week ending (Sunday)</label>
              <input type="date" value={iWeekEnd} onChange={e=>setIWeekEnd(e.target.value)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm shadow-sm"/>
            </div>
          </div>

          {/* Daily assignments */}
          <div className="rounded-lg border bg-white p-5 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-slate-700">Step 3 — Daily Crew Assignments &amp; AvB PDFs</p>
            <p className="mb-4 text-xs text-slate-400">For each day: upload the AvB PDF (crew hours auto-fill), then assign employees. Assignments can differ day to day.</p>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Copy assignments from</span>
              <select value={cpFrom} onChange={e=>setCpFrom(e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-xs">
                <option value="">— day —</option>
                {Array.from({length:7},(_,i)=><option key={i} value={i}>{dayLabel(iData.gusto.weekStart,i)}</option>)}
              </select>
              <span>to</span>
              <select value={cpTo} onChange={e=>setCpTo(e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-xs">
                <option value="">— day —</option>
                {Array.from({length:7},(_,i)=><option key={i} value={i}>{dayLabel(iData.gusto.weekStart,i)}</option>)}
              </select>
              <button onClick={copyDay} className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50">Copy</button>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {Array.from({length:7},(_,i)=>(
                <DayPill key={i} label={dayLabel(iData.gusto.weekStart,i)} active={iDay===i}
                  hasAvb={CREW_DEFS.some(cr=>(iData.days[i]?.avb[cr.code]?.actual??0)>0)}
                  onClick={()=>setIDay(i)}/>
              ))}
            </div>
            {/* PDF drop */}
            <div className="mb-4">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-400">AvB PDF — {dayLabel(iData.gusto.weekStart,iDay)} (auto-fills crew hours)</p>
              <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-xs transition-colors",
                avbSt[iDay]?.startsWith("✓")?"border-green-400 bg-green-50 text-green-700":"border-slate-200 text-slate-500 hover:border-brand-400 hover:bg-brand-50")}>
                <FileText className="h-4 w-4 shrink-0"/>
                {avbSt[iDay]??"Drop AvB PDF or click to browse"}
                <input type="file" accept=".pdf" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)handlePdf(f,iDay);}}/>
              </label>
            </div>
            {/* Crew cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {CREW_DEFS.map(cr=>{
                const members=iDay0.assignments[cr.code]??[];
                const avb=iDay0.avb[cr.code]??{budgeted:0,actual:0,revenue:0};
                const unassigned=FIELD_UUIDS.filter(u=>!members.includes(u));
                const ws0=iData.gusto.weekStart;
                return(
                  <div key={cr.code} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">{cr.name}</span>
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{cr.code}</span>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1">
                      {members.length===0&&<span className="text-[11px] text-slate-400">No members</span>}
                      {members.map(uuid=>{
                        const emp=getEmp(uuid); if(!emp) return null;
                        const hrs=ws0?(()=>{const iso=dayIso(ws0,iDay);const[yr,mo,da]=iso.split("-");const dk=`${mo}/${da}/${yr.slice(2)}`;return iData.gusto.employees[uuid]?.days.find(d=>d.date===dk)?.total??null;})():null;
                        return(
                          <span key={uuid} className="inline-flex items-center gap-1 rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-700">
                            {emp.name.split(" ")[0]}
                            {hrs!==null&&hrs>0&&<span className="text-slate-400">{hrs.toFixed(1)}h</span>}
                            <button onClick={()=>rmEmp(iDay,cr.code,uuid)} className="text-red-400 hover:text-red-600 leading-none">×</button>
                          </span>
                        );
                      })}
                    </div>
                    <select onChange={e=>{if(e.target.value){addEmp(iDay,cr.code,e.target.value);e.target.value="";}}} defaultValue=""
                      className="mb-2 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                      <option value="">Add employee…</option>
                      {unassigned.map(uuid=>{const emp=getEmp(uuid);return emp?<option key={uuid} value={uuid}>{emp.name}</option>:null;})}
                    </select>
                    <div className="border-t border-slate-200 pt-2">
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">AvB hours {avb.actual>0&&<span className="text-green-600">✓</span>}</p>
                      <div className="grid grid-cols-3 gap-1">
                        {(["budgeted","actual","revenue"] as const).map(field=>(
                          <div key={field}>
                            <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-0.5">
                              {field==="budgeted"?"Budget":field==="actual"?"On-site":"Rev $"}
                            </label>
                            <input type="number" step={field==="revenue"?"1":"0.5"} min="0"
                              value={(avb[field] as number)||""} placeholder="0"
                              onChange={e=>setAvb(iDay,cr.code,field,e.target.value)}
                              className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-right text-[11px] focus:border-brand-400 focus:outline-none"/>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleSave} disabled={upsert.isPending}
              className="flex items-center gap-2 rounded-md bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
              <CheckCircle2 className="h-4 w-4"/>{upsert.isPending?"Saving…":"Save week → Dashboard"}
            </button>
            <button onClick={()=>setTab("summary")} className="rounded-md border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
