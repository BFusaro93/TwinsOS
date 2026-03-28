import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subValue?: string | number;
  subLabel?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  className?: string;
  href?: string;
}

export function StatCard({
  title,
  value,
  subValue,
  subLabel,
  icon: Icon,
  trend,
  trendValue,
  className,
  href,
}: StatCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-50">
            <Icon className="h-4 w-4 text-brand-600" />
          </div>
        )}
      </div>

      <div className="mt-2">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {(subValue !== undefined || subLabel) && (
          <p className="mt-0.5 text-sm text-slate-500">
            {subValue !== undefined && (
              <span className="font-medium text-slate-700">{subValue}</span>
            )}
            {subLabel && <span> {subLabel}</span>}
          </p>
        )}
      </div>

      {trendValue && (
        <div className="mt-3 flex items-center gap-1">
          <span
            className={cn(
              "text-xs font-medium",
              trend === "up" && "text-green-600",
              trend === "down" && "text-red-600",
              trend === "neutral" && "text-slate-500"
            )}
          >
            {trendValue}
          </span>
        </div>
      )}
    </>
  );

  const cardClassName = cn(
    "rounded-lg border bg-white p-5 shadow-sm",
    href && "transition-shadow hover:shadow-md cursor-pointer",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cardClassName}>
        {content}
      </Link>
    );
  }

  return <div className={cardClassName}>{content}</div>;
}
