import { Check, Download, Pencil, Trash2 } from "lucide-react";

const STEPS = ["Open", "In Progress", "Done"];
const ACTIVE_STEP = 1;

const LIST = [
  { num: "WO-00138", title: "Mow Deck Belt Replacement", cls: "border-blue-200 bg-blue-50 text-blue-700", label: "Open" },
  { num: "WO-00142", title: "Mow & Trim — Front Ave", cls: "border-brand-200 bg-brand-100 text-brand-800", label: "In Progress", active: true },
  { num: "WO-00139", title: "Trailer Brake Inspection", cls: "border-yellow-200 bg-yellow-100 text-yellow-700", label: "On Hold" },
  { num: "WO-00131", title: "Spreader Calibration", cls: "border-green-200 bg-green-100 text-green-800", label: "Done" },
];

const TABS = ["Details", "Parts", "Labor", "Photos"];

export function WorkOrderMockup() {
  return (
    <div className="flex text-left">
      <div className="w-[190px] shrink-0 border-r border-[#eceae3]">
        <div className="border-b border-[#eceae3] px-3 py-2.5 text-[13px] font-bold text-[#0a0a0a]">Work Orders</div>
        {LIST.map((wo) => (
          <div
            key={wo.num}
            className={`border-b border-[#f0efe9] px-3 py-2 ${wo.active ? "bg-slate-50" : ""}`}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[9.5px] font-medium text-slate-400">{wo.num}</span>
              <span className={`rounded border px-1 py-[1px] text-[8px] font-medium ${wo.cls}`}>{wo.label}</span>
            </div>
            <div className="truncate text-[10.5px] font-medium text-[#0a0a0a]">{wo.title}</div>
          </div>
        ))}
      </div>

      <div className="flex-1">
        <div className="flex items-center justify-between border-b border-[#eceae3] px-4 py-3">
          <div>
            <div className="text-[13px] font-bold text-[#0a0a0a]">WO-00142</div>
            <div className="text-[11px] text-slate-500">Mow & Trim — Front Ave</div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded border border-brand-200 bg-brand-100 px-1.5 py-0.5 text-[9px] font-medium text-brand-800">In Progress</span>
            <span className="flex items-center gap-1 rounded border border-slate-200 px-1.5 py-1 text-[9px] text-slate-500"><Download className="h-2.5 w-2.5" />PDF</span>
            <span className="flex items-center gap-1 rounded border border-slate-200 px-1.5 py-1 text-[9px] text-slate-500"><Pencil className="h-2.5 w-2.5" />Edit</span>
            <span className="rounded p-1 text-slate-300"><Trash2 className="h-2.5 w-2.5" /></span>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-[#eceae3] px-4 py-3">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-semibold ${
                  i < ACTIVE_STEP
                    ? "border-brand-500 bg-brand-500 text-white"
                    : i === ACTIVE_STEP
                      ? "border-brand-500 bg-white text-brand-600"
                      : "border-slate-200 bg-white text-slate-300"
                }`}
              >
                {i < ACTIVE_STEP ? <Check className="h-2.5 w-2.5" /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium ${i <= ACTIVE_STEP ? "text-slate-700" : "text-slate-300"}`}>{step}</span>
              {i < STEPS.length - 1 && <div className={`h-px w-8 ${i < ACTIVE_STEP ? "bg-brand-500" : "bg-slate-200"}`} />}
            </div>
          ))}
        </div>

        <div className="flex gap-4 border-b border-[#eceae3] px-4 text-[11px]">
          {TABS.map((t, i) => (
            <span
              key={t}
              className={`border-b-2 py-2 font-medium ${i === 0 ? "border-brand-500 text-brand-600" : "border-transparent text-slate-500"}`}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 text-[11px]">
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Asset</div>
            <div className="mt-0.5 text-slate-700">2019 Exmark Lazer Z — Unit 14</div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Assigned To</div>
            <div className="mt-0.5 text-slate-700">D. Reyes</div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Priority</div>
            <div className="mt-0.5"><span className="rounded border border-yellow-200 bg-yellow-100 px-1.5 py-0.5 text-[9px] font-medium text-yellow-700">Medium</span></div>
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Due</div>
            <div className="mt-0.5 text-slate-700">Aug 26, 2026</div>
          </div>
        </div>
      </div>
    </div>
  );
}
