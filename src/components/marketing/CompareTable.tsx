import { Check, Minus } from "lucide-react";
import type { ComparisonRow } from "@/lib/comparisons";

function cellIcon(value: string) {
  const v = value.toLowerCase();
  if (v === "included" || v.startsWith("included")) return <Check className="h-4 w-4 shrink-0 text-[#60ab45]" />;
  if (v === "not offered" || v === "not available" || v === "none") return <Minus className="h-4 w-4 shrink-0 text-slate-300" />;
  return null;
}

export function CompareTable({ rows, competitorName }: { rows: ComparisonRow[]; competitorName: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#e6e6e0]">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-[#fbfbf8]">
            <th className="px-5 py-3.5 font-semibold text-slate-500">&nbsp;</th>
            <th className="px-5 py-3.5 font-[family-name:var(--font-heading)] font-bold text-[#005642]">Landscapt</th>
            <th className="px-5 py-3.5 font-[family-name:var(--font-heading)] font-bold text-slate-600">{competitorName}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-[#eceae3]">
              <td className="px-5 py-3.5 text-slate-600">{r.label}</td>
              <td className="px-5 py-3.5 font-medium text-[#0a0a0a]">
                <span className="flex items-center gap-2">
                  {cellIcon(r.landscapt)}
                  {r.landscapt}
                </span>
              </td>
              <td className="px-5 py-3.5 text-slate-600">
                <span className="flex items-center gap-2">
                  {cellIcon(r.competitor)}
                  {r.competitor}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
