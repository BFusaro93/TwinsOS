interface ReportStatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  /** Tailwind text color for the value, e.g. "text-red-600". */
  valueClassName?: string;
  /** When set, the card is a button that opens the detail behind the number. */
  onClick?: () => void;
}

export function ReportStatCard({ label, value, sub, valueClassName = "text-slate-900 dark:text-neutral-100", onClick }: ReportStatCardProps) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`rounded-lg border bg-card shadow-sm p-4 ${
        onClick ? "text-left transition-colors hover:border-slate-300 dark:hover:border-neutral-700 hover:bg-slate-50 dark:hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-neutral-600" : ""
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${valueClassName}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Wrapper>
  );
}

export function ReportSkeletonCard() {
  return <div className="h-24 animate-pulse rounded-lg border bg-muted" />;
}
