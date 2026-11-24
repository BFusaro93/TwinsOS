import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface SortableTableHeadProps {
  label: string;
  sortKey: string;
  activeSortKey: string;
  sortDir: "asc" | "desc";
  onToggle: (key: string) => void;
  className?: string;
}

export function SortableTableHead({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onToggle,
  className,
}: SortableTableHeadProps) {
  const isActive = sortKey === activeSortKey;

  return (
    <TableHead className={cn("cursor-pointer select-none hover:text-slate-600 dark:hover:text-neutral-400", className)} onClick={() => onToggle(sortKey)}>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap font-semibold uppercase tracking-wide"
      >
        {label}
        {isActive ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3 text-slate-600 dark:text-neutral-400" />
          ) : (
            <ArrowDown className="h-3 w-3 text-slate-600 dark:text-neutral-400" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-neutral-500" />
        )}
      </button>
    </TableHead>
  );
}
