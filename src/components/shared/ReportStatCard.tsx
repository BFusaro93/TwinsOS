interface ReportStatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  /** Tailwind text color for the value, e.g. "text-red-600". */
  valueClassName?: string;
}

export function ReportStatCard({ label, value, sub, valueClassName = "text-slate-900" }: ReportStatCardProps) {
  return (
    <div className="rounded-lg border bg-white shadow-sm p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${valueClassName}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function ReportSkeletonCard() {
  return <div className="h-24 animate-pulse rounded-lg border bg-slate-100" />;
}
